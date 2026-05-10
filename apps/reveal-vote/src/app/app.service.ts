/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { COORDINATOR_MESSAGE_PATTERNS } from '@libs/constants/message-patterns.constant'
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Inject,
    Injectable,
    NotFoundException
} from '@nestjs/common'
import { PrismaService } from '../infrastructure/prisma/prisma.service'
import { RevealVoteDto } from '@libs/types/reveal-vote/app.dto'
import { EcParams, hashToScalar, hexToPoint, hexToScalar, scalarToBuffer, scalarToHex, verify } from '@libs/ec-schnorr'
import { CONFIGURATION } from '../configuration'
import { ClientProxy } from '@nestjs/microservices'
import { lastValueFrom } from 'rxjs'

@Injectable()
export class AppService {
    constructor(
        private readonly prisma: PrismaService,
        @Inject(`TCP_${CONFIGURATION.REVEAL_VOTE_CONFIG.COORDINATOR_TCP_NAME}`)
        private readonly coordinatorClient: ClientProxy
    ) {}

    private async computeBlindedVoteHash(candidateId: string, h: bigint, sPrime: bigint, params: EcParams) {
        const messageBuf = Buffer.from(candidateId, 'utf8')
        const hBuf = scalarToBuffer(h)
        const sPrimeBuf = scalarToBuffer(sPrime)
        return scalarToHex(hashToScalar([messageBuf, hBuf, sPrimeBuf], params.n))
    }

    async revealVote(dto: RevealVoteDto, ecParams: EcParams) {
        //SECTION - Kiểm tra election
        const existElection = await lastValueFrom(
            this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.GET_ELECTION_BY_ID, {
                id: dto.electionId
            })
        )

        const collectivePublicKey = await lastValueFrom(
            this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.COLLECTIVE_PUBLIC_KEY, {})
        )

        if (existElection!.status !== 'CLOSED') {
            throw new ForbiddenException('Election is not closed')
        }

        if (collectivePublicKey !== existElection!.collectivePublicKey) {
            throw new ConflictException('Collective public key of election does not match with signing nodes param')
        }

        if (!existElection!.collectivePublicKey) {
            throw new ConflictException('Election must has collectivePublicKey to reveal')
        }

        if (!existElection!.candidateIds.includes(dto.candidateId)) {
            throw new ForbiddenException('Candidate is not in the election')
        }

        const h = hexToScalar(dto.h)
        const sPrime = hexToScalar(dto.sPrime)
        const rho = hexToPoint(existElection!.collectivePublicKey, ecParams)

        //SECTION - Kiểm tra signature
        const messageBuf = Buffer.from(dto.candidateId, 'utf-8')
        const isValidSignature = verify(messageBuf, h, sPrime, ecParams, rho)

        if (!isValidSignature) {
            throw new BadRequestException('Invalid signature')
        }

        //SECTION - Tính blindedVoteHash
        const computedBlindedVoteHash = await this.computeBlindedVoteHash(dto.candidateId, h, sPrime, ecParams)

        //SECTION - Kiểm tra blindedVoteHash có tồn tại trong database kchống anti-replay attack
        const existVote = await this.prisma.revealedVote.findUnique({
            where: {
                electionId_blindedVoteHash: {
                    electionId: dto.electionId,
                    blindedVoteHash: computedBlindedVoteHash
                }
            }
        })

        if (existVote) {
            throw new ConflictException('Vote has already been revealed')
        }

        //SECTION - Kiểm tra vote có tồn tại trong bảng votes không
        const existSubmittedVote = await lastValueFrom(
            this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.GET_VOTE_BY_BLINDED_HASH, {
                electionId: dto.electionId,
                blindedVoteHash: computedBlindedVoteHash
            })
        )

        if (!existSubmittedVote) {
            throw new NotFoundException('No corresponding submitted vote found for the revealed vote')
        }

        if (existSubmittedVote.revealed) {
            throw new ConflictException('This vote has already been revealed')
        }

        const revealedVote = await this.prisma.revealedVote.create({
            data: {
                electionId: dto.electionId,
                candidateId: dto.candidateId,
                blindedVoteHash: computedBlindedVoteHash,
                signature: {
                    h: dto.h,
                    sPrime: dto.sPrime
                }
            }
        })

        //SECTION - Cập nhật revealed = true cho vote đã được reveal
        await this.coordinatorClient.emit(COORDINATOR_MESSAGE_PATTERNS.UPDATE_REVEALED_STATUS, {
            electionId: dto.electionId,
            blindedVoteHash: computedBlindedVoteHash
        })

        //SECTION - Auto-transition closed → completed khi mọi phiếu đã reveal
        const remainingUnrevealedVote = await lastValueFrom(
            this.coordinatorClient.send(COORDINATOR_MESSAGE_PATTERNS.CHECK_EXIST_UNREVEALED_VOTE, {
                id: dto.electionId
            })
        )

        if (!remainingUnrevealedVote) {
            await this.coordinatorClient.emit(COORDINATOR_MESSAGE_PATTERNS.COMPLETE_ELCTION, { id: dto.electionId })
        }

        return { ...revealedVote, electionCompleted: !remainingUnrevealedVote }
    }
}
