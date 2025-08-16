import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { ChecksModule } from './checks/checks.module';
import { SyncModule } from './sync/sync.module';
import { TcslModule } from './tcsl/tcsl.module';

@Module({
  imports: [ScheduleModule.forRoot(), DatabaseModule, ChecksModule, SyncModule, TcslModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
