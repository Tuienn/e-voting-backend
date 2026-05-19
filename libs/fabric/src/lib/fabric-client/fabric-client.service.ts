import { BadRequestException, Inject, Injectable, OnModuleInit } from '@nestjs/common'
import axios, { AxiosInstance } from 'axios'
import { wrapper } from 'axios-cookiejar-support'
import { CookieJar } from 'tough-cookie'
import { FABRIC_OPTIONS } from './fabric-client.constants'
import { FabricClientModuleOptions, InvokeChaincodeResponse, QueryChaincodeResponse } from './fabric-client.types'

@Injectable()
export class FabricClientService implements OnModuleInit {
    private client: AxiosInstance

    constructor(
        @Inject(FABRIC_OPTIONS)
        private readonly options: FabricClientModuleOptions
    ) {}

    async onModuleInit() {
        const jar = new CookieJar()

        this.client = wrapper(
            axios.create({
                baseURL: this.options.baseURL,
                jar,
                withCredentials: true
            })
        )

        await this.client.post('/auth/login', {
            username: this.options.username,
            password: this.options.password
        })
    }

    private genApiChaincodeBody(functionName: string, args: string[]) {
        return {
            function: functionName,
            args,
            channel: this.options.channelName,
            key_id: this.options.orgId
        }
    }

    //NOTE - Các hàm dưới đây sẽ gọi API của chaincode, xem type response.data ở chainlaunch/chaincode/types.go
    async submitVote(electionId: string, voterId: string, blindedCommitment: string): Promise<InvokeChaincodeResponse> {
        try {
            const response = await this.client.post(
                `/sc/fabric/chaincodes/${this.options.chaincodeId}/invoke`,
                this.genApiChaincodeBody('SubmitVote', [electionId, voterId, blindedCommitment])
            )

            return response.data
        } catch (error: any) {
            throw new BadRequestException(`Failed to submit vote: ${error.message}`)
        }
    }

    async getVote(electionId: string, voteId: string): Promise<QueryChaincodeResponse> {
        try {
            const response = await this.client.post(
                `/sc/fabric/chaincodes/${this.options.chaincodeId}/query`,
                this.genApiChaincodeBody('GetVote', [electionId, voteId])
            )

            return response.data
        } catch (error: any) {
            return {
                message: `Failed to get vote on chain: ${error.message}`,
                result: ''
            }
        }
    }

    async commitMerkleRoot(
        electionId: string,
        merkleRoot: string,
        voteCount: number
    ): Promise<InvokeChaincodeResponse> {
        try {
            const response = await this.client.post(
                `/sc/fabric/chaincodes/${this.options.chaincodeId}/invoke`,
                this.genApiChaincodeBody('CommitMerkleRoot', [electionId, merkleRoot, voteCount.toString()])
            )

            return response.data
        } catch (error: any) {
            throw new BadRequestException(`Failed to commit Merkle root on chain: ${error.message}`)
        }
    }

    async getMerkleRoot(electionId: string): Promise<QueryChaincodeResponse> {
        try {
            const response = await this.client.post(
                `/sc/fabric/chaincodes/${this.options.chaincodeId}/query`,
                this.genApiChaincodeBody('GetMerkleRoot', [electionId])
            )

            return response.data
        } catch (error: any) {
            return {
                message: `Failed to get Merkle root on chain: ${error.message}`,
                result: ''
            }
        }
    }

    async revealVote(
        electionId: string,
        candidateId: string,
        revealKey: string,
        revealPayloadHash: string
    ): Promise<InvokeChaincodeResponse> {
        try {
            const response = await this.client.post(
                `/sc/fabric/chaincodes/${this.options.chaincodeId}/invoke`,
                this.genApiChaincodeBody('RevealVoteCompact', [electionId, candidateId, revealKey, revealPayloadHash])
            )

            return response.data
        } catch (error: any) {
            throw new BadRequestException(`Failed to reveal vote on chain: ${error.message}`)
        }
    }

    async getAuditCounts(electionId: string): Promise<QueryChaincodeResponse> {
        try {
            const response = await this.client.post(
                `/sc/fabric/chaincodes/${this.options.chaincodeId}/query`,
                this.genApiChaincodeBody('GetAuditCounts', [electionId])
            )

            return response.data
        } catch (error: any) {
            return {
                message: `Failed to get audit counts on chain: ${error.message}`,
                result: ''
            }
        }
    }

    async getTallyResult(electionId: string): Promise<QueryChaincodeResponse> {
        try {
            const response = await this.client.post(
                `/sc/fabric/chaincodes/${this.options.chaincodeId}/query`,
                this.genApiChaincodeBody('GetTally', [electionId])
            )

            return response.data
        } catch (error: any) {
            return {
                message: `Failed to get tally result on chain: ${error.message}`,
                result: ''
            }
        }
    }

    async verifyVoteReceipt(electionId: string, commitment: string, proof: string[]): Promise<QueryChaincodeResponse> {
        const proofJSON = JSON.stringify(proof)

        try {
            const response = await this.client.post(
                `/sc/fabric/chaincodes/${this.options.chaincodeId}/query`,
                this.genApiChaincodeBody('VerifyVoteReceipt', [electionId, commitment, proofJSON])
            )

            return response.data
        } catch (error: any) {
            return {
                message: `Failed to verify vote receipt on chain: ${error.message}`,
                result: ''
            }
        }
    }
}
