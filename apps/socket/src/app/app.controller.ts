import { Controller } from '@nestjs/common'
import { EventPattern, Payload } from '@nestjs/microservices'
import { SOCKET_EVENT_PATTERNS } from '@libs/constants/message-patterns.constant'
import { EventsGateway } from './events.gateway'
import { VoteCommittedPayload, VoteRevealedPayload } from '@libs/types/socket/app.type'

@Controller()
export class AppController {
    constructor(private readonly eventsGateway: EventsGateway) {}

    //NOTE - Nhận event vote committed từ coordinator qua Redis Pub/Sub rồi phát tới room election tương ứng
    @EventPattern(SOCKET_EVENT_PATTERNS.VOTE_COMMITTED)
    handleVoteCommitted(@Payload() data: VoteCommittedPayload) {
        this.eventsGateway.emitToElection(data.electionId, 'vote:committed', data)
    }

    //NOTE - Nhận event vote revealed từ reveal-vote qua Redis Pub/Sub rồi phát tới room election tương ứng
    @EventPattern(SOCKET_EVENT_PATTERNS.VOTE_REVEALED)
    handleVoteRevealed(@Payload() data: VoteRevealedPayload) {
        this.eventsGateway.emitToElection(data.electionId, 'vote:revealed', data)
    }
}
