import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { ChecksModule } from './checks/checks.module';
import { SyncModule } from './sync/sync.module';
import { TcslModule } from './tcsl/tcsl.module';
import { MailModule } from './mail/mail.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    ChecksModule,
    SyncModule,
    TcslModule,
    MailModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
