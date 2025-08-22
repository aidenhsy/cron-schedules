import { Module } from '@nestjs/common';
import { ChecksService } from './checks.service';
import { DatabaseModule } from 'src/database/database.module';
import { ChecksController } from './checks.controller';
import { MailModule } from 'src/mail/mail.module';

@Module({
  providers: [ChecksService],
  imports: [DatabaseModule, MailModule],
  controllers: [ChecksController],
})
export class ChecksModule {}
