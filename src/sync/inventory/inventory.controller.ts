import {
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  Logger,
  Get,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';

@Controller('sync')
export class InventoryController {
  private readonly logger = new Logger(InventoryController.name);

  constructor(private readonly inventoryService: InventoryService) {}

  @Get('inventory/supplier-items')
  async syncSupplierItems() {
    try {
      this.logger.log('Manual sync of supplier items triggered');
      await this.inventoryService.syncSupplierItems();
      return {
        success: true,
        message: 'Supplier items sync completed successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to sync supplier items', error.stack);
      throw error;
    }
  }

  @Get('inventory/supplier-orders')
  async syncSupplierOrders() {
    try {
      this.logger.log('Manual sync of supplier orders triggered');
      await this.inventoryService.syncSupplierOrders();
      return {
        success: true,
        message: 'Supplier orders sync completed successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to sync supplier orders', error.stack);
      throw error;
    }
  }

  @Get('inventory/wac/missing')
  async processMissingWac() {
    try {
      this.logger.log('Processing missing WAC records triggered');
      await this.inventoryService.missingWac();
      return {
        success: true,
        message: 'Missing WAC processing completed successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to process missing WAC', error.stack);
      throw error;
    }
  }

  @Get('inventory/wac/recalculate')
  async recalculateWac() {
    try {
      this.logger.log('WAC recalculation triggered');
      await this.inventoryService.recalculateWac();
      return {
        success: true,
        message: 'WAC recalculation completed successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to recalculate WAC', error.stack);
      throw error;
    }
  }
}
