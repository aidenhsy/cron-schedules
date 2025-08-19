import { Module } from '@nestjs/common';
import { InventoryService } from './inventory/inventory.service';
import { DatabaseModule } from 'src/database/database.module';
import { InventoryController } from './inventory/inventory.controller';
import { FoodItemController } from './food-item/food-item.controller';
import { FoodItemService } from './food-item/food-item.service';
import { TcslModule } from 'src/tcsl/tcsl.module';

@Module({
  providers: [InventoryService, FoodItemService],
  imports: [DatabaseModule, TcslModule],
  controllers: [InventoryController, FoodItemController],
})
export class SyncModule {}
