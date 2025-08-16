import { Module } from '@nestjs/common';
import { AuthController } from './授权获取/授权获取.controller';
import { AuthService } from './授权获取/授权获取.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService],
})
export class TcslModule {}
