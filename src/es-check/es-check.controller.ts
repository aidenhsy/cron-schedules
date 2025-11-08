import { Controller, Get } from '@nestjs/common';
import { EsCheckService } from './es-check.service';

@Controller('es-check')
export class EsCheckController {
  constructor(private readonly esCheckService: EsCheckService) {}

  @Get('miwa')
  async check() {
    return this.esCheckService.checkMiwa();
  }
}
