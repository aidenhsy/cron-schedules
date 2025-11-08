import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { MailModule } from './mail/mail.module';
import { ConfigModule } from '@nestjs/config';
import { EsCheckModule } from './es-check/es-check.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    MailModule,
    EsCheckModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
