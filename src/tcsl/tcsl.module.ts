import { Module } from '@nestjs/common';
import { AuthController } from './授权获取/授权获取.controller';
import { AuthService } from './授权获取/授权获取.service';
import { BasicDataController } from './基础档案/基础档案.controller';
import { BasicDataService } from './基础档案/基础档案.service';

@Module({
  controllers: [AuthController, BasicDataController],
  providers: [AuthService, BasicDataService],
  exports: [BasicDataService],
})
export class TcslModule {}
