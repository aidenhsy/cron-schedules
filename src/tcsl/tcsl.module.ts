import { Module } from '@nestjs/common';
import { AuthController } from './授权获取/授权获取.controller';
import { AuthService } from './授权获取/授权获取.service';
import { BasicDataController } from './基础档案/基础档案.controller';
import { BasicDataService } from './基础档案/基础档案.service';
import { OperationController } from './业务数据/业务数据.controller';
import { OperationService } from './业务数据/业务数据.service';

@Module({
  controllers: [AuthController, BasicDataController, OperationController],
  providers: [AuthService, BasicDataService, OperationService],
  exports: [BasicDataService, OperationService],
})
export class TcslModule {}
