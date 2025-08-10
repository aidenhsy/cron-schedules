import { Module } from '@nestjs/common';
import { InventoryService } from './inventory/inventory.service';
import { DatabaseModule } from 'src/database/database.module';
import { InventoryController } from './inventory/inventory.controller';

@Module({
  providers: [InventoryService],
  imports: [DatabaseModule],
  controllers: [InventoryController],
})
export class SyncModule {}
