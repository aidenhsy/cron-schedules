import { Module } from '@nestjs/common';
import { ChecksService } from './checks.service';
import { DatabaseModule } from 'src/database/database.module';

@Module({
  providers: [ChecksService],
  imports: [DatabaseModule],
})
export class ChecksModule {}
