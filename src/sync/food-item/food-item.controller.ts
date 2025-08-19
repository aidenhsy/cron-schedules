import { Controller, Get } from '@nestjs/common';
import { FoodItemService } from './food-item.service';

@Controller('sync')
export class FoodItemController {
  constructor(private readonly foodItemService: FoodItemService) {}

  @Get('food-item')
  async syncFoodItem() {
    return this.foodItemService.syncFoodItem();
  }
}
