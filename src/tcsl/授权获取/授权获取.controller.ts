import { Controller, Get } from '@nestjs/common';
import { AuthService } from './授权获取.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('token')
  async getAccessToken() {
    return this.authService.accessToken();
  }
}
