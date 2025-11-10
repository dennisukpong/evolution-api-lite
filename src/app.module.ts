import { Module } from '@nestjs/common';
import { WebsocketGateway } from './websocket/websocket.gateway';

@Module({
  imports: [],
  controllers: [],
  providers: [WebsocketGateway],
})
export class AppModule {}
