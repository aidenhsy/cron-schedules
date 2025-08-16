import { Injectable } from '@nestjs/common';
import * as axios from 'axios';

@Injectable()
export class AuthService {
  async accessToken() {
    const res = await axios.default.post(
      'https://cysms.wuuxiang.com/api/auth/accesstoken',
      {},
      {
        params: {
          appid: process.env.APP_ID,
          accessid: process.env.ACCESS_ID,
          response_type: 'token',
        },
      },
    );
    return res.data.access_token;
  }
}
