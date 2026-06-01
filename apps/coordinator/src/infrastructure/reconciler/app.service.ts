import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { FabricClientService } from '@libs/fabric'
import { PrismaService } from '../prisma/prisma.service'
import { CONFIGURATION } from '../../configuration'
import { ElectionStatus, VoteStatus } from '../../../generated/prisma/enums'

const RECONCILER_CRON_JOB_NAME = 'coordinator-reconciler'

/**
 * Reconciler đồng bộ các record bị kẹt ở trạng thái trung gian (do process crash giữa lúc ghi DB và confirm)
 * với blockchain — chain.
 *
 *  - Vote.status = PENDING_CHAIN (Case 1 — SubmitVote): GetVote → có thì CONFIRMED, không thì xóa record.
 *  - Election.status = CLOSING  (Case 3 — CommitMerkleRoot): GetMerkleRoot → committed thì CLOSED, không thì về ACTIVE.
 *
 * Dùng @nestjs/schedule để chạy cron job nền.
 * Chỉ động vào record cũ hơn RECONCILER_STALE_MS để không tranh chấp với request đang chạy (synchronous path tự xử lý).
 */
@Injectable()
export class ReconcilerService implements OnApplicationBootstrap {
    private readonly logger = new Logger(ReconcilerService.name)
    private running = false

    constructor(
        private readonly prisma: PrismaService,
        private readonly fabricClient: FabricClientService
    ) {}

    onApplicationBootstrap() {
        this.logger.log(
            `Reconciler scheduled (cron="${CONFIGURATION.COORDINATOR_CONFIG.RECONCILER_CRON_EXPRESSION}", stale=${CONFIGURATION.COORDINATOR_CONFIG.RECONCILER_STALE_MS}ms)`
        )
    }

    @Cron(CONFIGURATION.COORDINATOR_CONFIG.RECONCILER_CRON_EXPRESSION, {
        name: RECONCILER_CRON_JOB_NAME,
        waitForCompletion: true,
        unrefTimeout: true
    })
    private async reconcile() {
        //NOTE - Chống overlap: nếu chu kỳ trước chưa xong (chain chậm) thì bỏ qua lần này
        if (this.running) return
        this.running = true
        try {
            await this.reconcilePendingVotes()
            await this.reconcileClosingElections()
        } catch (e) {
            this.logger.error(`Reconcile cycle failed: ${(e as Error).message}`)
        } finally {
            this.running = false
        }
    }

    //SECTION - Case 1: Vote kẹt PENDING_CHAIN
    private async reconcilePendingVotes() {
        const staleBefore = new Date(Date.now() - CONFIGURATION.COORDINATOR_CONFIG.RECONCILER_STALE_MS)

        const stuck = await this.prisma.vote.findMany({
            where: { status: VoteStatus.PENDING_CHAIN, createdAt: { lt: staleBefore } },
            select: { id: true, electionId: true }
        })

        for (const vote of stuck) {
            const chainVoteRes = await this.fabricClient.getVote(vote.electionId, vote.id)

            if (chainVoteRes.result) {
                //NOTE - Vote ĐÃ lên chain → confirm DB (process crash trước khi confirm)
                await this.prisma.vote
                    .update({
                        where: { id: vote.id },
                        data: { status: VoteStatus.CONFIRMED, blockchainRef: JSON.parse(chainVoteRes.result).txId }
                    })
                    .then(() => this.logger.warn(`Reconciled vote ${vote.id} → CONFIRMED`))
                    .catch((err) => this.logger.error(`Confirm vote ${vote.id} failed: ${err?.message}`))
            } else {
                //NOTE - Chain CHƯA có vote → submit không thành công → xóa record PENDING để voter có thể vote lại
                await this.prisma.vote
                    .delete({ where: { id: vote.id } })
                    .then(() => this.logger.warn(`Reconciled vote ${vote.id} → rolled back (not on chain)`))
                    .catch((err) => this.logger.error(`Rollback vote ${vote.id} failed: ${err?.message}`))
            }
        }
    }

    //SECTION - Case 3: Election kẹt CLOSING
    private async reconcileClosingElections() {
        const staleBefore = new Date(Date.now() - CONFIGURATION.COORDINATOR_CONFIG.RECONCILER_STALE_MS)

        const stuck = await this.prisma.election.findMany({
            where: { status: ElectionStatus.CLOSING, updatedAt: { lt: staleBefore } },
            select: { id: true }
        })

        for (const election of stuck) {
            const chainMerkleRes = await this.fabricClient.getMerkleRoot(election.id)

            if (chainMerkleRes.result) {
                //NOTE - Root ĐÃ committed trên chain → confirm CLOSED (recover txId + merkleRoot từ chain)
                const chainMerkle = JSON.parse(chainMerkleRes.result)
                await this.prisma.election
                    .update({
                        where: { id: election.id },
                        data: {
                            status: ElectionStatus.CLOSED,
                            merkleRoot: chainMerkle.merkleRoot,
                            blockchainRef: chainMerkle.txId
                        }
                    })
                    .then(() => this.logger.warn(`Reconciled election ${election.id} → CLOSED`))
                    .catch((err) => this.logger.error(`Confirm election ${election.id} failed: ${err?.message}`))
            } else {
                //NOTE - Không thể phân biệt "chain chưa commit" vs "network/Chainlaunch lỗi tạm thời"
                // vì FabricClientService.getMerkleRoot trả result:'' trong cả hai trường hợp.
                // Rollback sai khi network lỗi → admin retry close sẽ thất bại (chain đã có root).
                // Chỉ CONFIRM từ reconciler; rollback do synchronous path của closeElection xử lý.
                this.logger.warn(
                    `Election ${election.id} stuck in CLOSING — chain unreachable or root not yet committed. Skipping rollback; requires manual admin retry of closeElection.`
                )
            }
        }
    }
}
