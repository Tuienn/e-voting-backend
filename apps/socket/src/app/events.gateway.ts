import { ElectionSubscription } from '@libs/types/socket/app.type'
import { Logger } from '@nestjs/common'
import {
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { CONFIGURATION } from '../configuration'

//NOTE - Gateway Socket.IO mở (không JWT), CORS lấy từ env. Client join/leave room election:{electionId} để nhận event realtime
@WebSocketGateway({
    cors: {
        origin: CONFIGURATION.SOCKET_CONFIG.CORS_ORIGINS.split(',')
    }
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private readonly logger = new Logger(EventsGateway.name)

    @WebSocketServer() server: Server

    handleConnection(client: Socket) {
        this.logger.debug(`Client connected: ${client.id}`)
    }

    handleDisconnect(client: Socket) {
        this.logger.debug(`Client disconnected: ${client.id}`)
    }

    @SubscribeMessage('election:subscribe')
    handleSubscribe(client: Socket, payload: ElectionSubscription) {
        const room = `election:${payload.electionId}`
        client.join(room)
        this.logger.debug(`Client ${client.id} joined ${room}`)
    }

    @SubscribeMessage('election:unsubscribe')
    handleUnsubscribe(client: Socket, payload: ElectionSubscription) {
        const room = `election:${payload.electionId}`
        client.leave(room)
        this.logger.debug(`Client ${client.id} left ${room}`)
    }

    //NOTE - Phát event tới mọi client đang ở trong room của election (gọi từ controller khi nhận event Redis Pub/Sub)
    emitToElection(electionId: string, event: string, payload: unknown) {
        this.server.to(`election:${electionId}`).emit(event, payload)
    }
}
