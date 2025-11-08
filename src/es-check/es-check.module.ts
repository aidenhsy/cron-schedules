import { Module } from '@nestjs/common';
import { EsCheckController } from './es-check.controller';
import { EsCheckService } from './es-check.service';
import { DatabaseModule } from 'src/database/database.module';
import { MailModule } from 'src/mail/mail.module';

@Module({
  controllers: [EsCheckController],
  providers: [EsCheckService],
  imports: [DatabaseModule, MailModule],
})
export class EsCheckModule {}
