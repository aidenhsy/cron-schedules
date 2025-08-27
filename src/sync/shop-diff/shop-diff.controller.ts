import { Controller, Get } from '@nestjs/common';
import { ShopDiffService } from './shop-diff.service';

@Controller('sync')
export class ShopDiffController {
  constructor(private readonly shopDiffService: ShopDiffService) {}

  @Get('shop-diff')
  async shopDiff() {
    return this.shopDiffService.getShopDiff();
  }
}
