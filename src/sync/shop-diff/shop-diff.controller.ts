import { Controller, Get, Res } from '@nestjs/common';
import { ShopDiffService } from './shop-diff.service';
import { Response } from 'express';

@Controller('sync')
export class ShopDiffController {
  constructor(private readonly shopDiffService: ShopDiffService) {}

  @Get('shop-diff')
  async shopDiff(@Res() res: Response) {
    const data = await this.shopDiffService.getShopDiff();
    // res.json(data);
    // 设置响应头，告诉浏览器这是要下载的文件
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="shop_db.json"');
    // 发送数据
    res.send(JSON.stringify(data));
  }
}
