import { Module } from '@nestjs/common';
import { ChecksService } from './checks.service';
import { DatabaseModule } from 'src/database/database.module';
import { ChecksController } from './checks.controller';

@Module({
  providers: [ChecksService],
  imports: [DatabaseModule],
  controllers: [ChecksController],
})
export class ChecksModule {}
