import { Module } from '@nestjs/common';
import { InventoryService } from './inventory/inventory.service';
import { DatabaseModule } from 'src/database/database.module';
import { InventoryController } from './inventory/inventory.controller';
import { FoodItemController } from './food-item/food-item.controller';
import { FoodItemService } from './food-item/food-item.service';
import { TcslModule } from 'src/tcsl/tcsl.module';
import { OrderController } from './order/order.controller';
import { OrderService } from './order/order.service';
import { FoodCategoryService } from './food-item/food-category.service';
import { ShopDiffController } from './shop-diff/shop-diff.controller';
import { ShopDiffService } from './shop-diff/shop-diff.service';

@Module({
  providers: [
    InventoryService,
    FoodItemService,
    OrderService,
    FoodCategoryService,
    ShopDiffService,
  ],
  imports: [DatabaseModule, TcslModule],
  controllers: [
    InventoryController,
    FoodItemController,
    OrderController,
    ShopDiffController,
  ],
})
export class SyncModule {}
