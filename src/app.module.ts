import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { ChecksModule } from './checks/checks.module';
import { SyncModule } from './sync/sync.module';
import { TcslModule } from './tcsl/tcsl.module';
import { MailModule } from './mail/mail.module';
import { ConfigModule } from '@nestjs/config';
import { RabbitmqModule } from './rabbitmq/rabbitmq.module';
import { OrderModule } from './order/order.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    ChecksModule,
    SyncModule,
    TcslModule,
    MailModule,
    RabbitmqModule,
    OrderModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
