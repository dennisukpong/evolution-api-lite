import { Module } from '@nestjs/common';
import { EvolutionGateway } from './websocket/evolution.gateway';

@Module({
  imports: [],
  controllers: [],
  providers: [EvolutionGateway],
})
export class AppModule {}