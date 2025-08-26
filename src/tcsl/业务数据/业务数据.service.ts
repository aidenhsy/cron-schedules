import { Injectable } from '@nestjs/common';
import { AuthService } from '../授权获取/授权获取.service';
import { axiosInstance } from 'src/lib/axiosInstance';

@Injectable()
export class OperationService {
  constructor(private readonly authService: AuthService) {}

  //账单明细查询
  async getSerialData(pageNo: number, shopId: number, settleDate: string) {
    const token = await this.authService.accessToken();

    const res = await axiosInstance.post(
      'https://cysms.wuuxiang.com/api/datatransfer/getserialdata',
      {},
      {
        headers: {
          access_token: token,
          accessid: process.env.ACCESS_ID,
          granttype: 'client',
        },
        params: {
          centerId: process.env.CENTER_ID,
          pageNo,
          shopId,
          settleDate,
          pageSize: '50',
          isDateFiltering: 1,
          needPkgDetail: 1,
        },
      },
    );

    return res.data.data;
  }
}
