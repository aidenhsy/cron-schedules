import { Controller, Get } from '@nestjs/common';
import { FoodItemService } from './food-item.service';
import { FoodCategoryService } from './food-category.service';

@Controller('sync')
export class FoodItemController {
  constructor(
    private readonly foodItemService: FoodItemService,
    private readonly foodCategoryService: FoodCategoryService,
  ) {}

  @Get('food-item')
  async syncFoodItem() {
    return this.foodItemService.syncFoodItem();
  }

  @Get('food-category')
  async syncFoodCategory() {
    return this.foodCategoryService.syncFoodCategory();
  }
}
