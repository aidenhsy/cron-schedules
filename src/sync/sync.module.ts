import { Module } from '@nestjs/common';
import { InventoryService } from './inventory/inventory.service';
import { DatabaseModule } from 'src/database/database.module';

@Module({
  controllers: [],
  providers: [InventoryService],
  imports: [DatabaseModule],
})
export class SyncModule {}
