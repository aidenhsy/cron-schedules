import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { ChecksModule } from './checks/checks.module';

@Module({
  imports: [ScheduleModule.forRoot(), DatabaseModule, ChecksModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
