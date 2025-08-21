import { Injectable } from '@nestjs/common';
import { axiosInstance } from 'src/lib/axiosInstance';
import { AuthService } from '../授权获取/授权获取.service';

@Injectable()
export class BasicDataService {
  constructor(private readonly authService: AuthService) {}

  // 品项档案信息
  async getitems(pageNo: number) {
    const token = await this.authService.accessToken();
    const res = await axiosInstance.post(
      'https://cysms.wuuxiang.com/api/datatransfer/getitems',
      {},
      {
        headers: {
          accessid: process.env.ACCESS_ID,
          granttype: 'client',
          access_token: token,
        },
        params: {
          centerId: process.env.CENTER_ID,
          pageSize: 50,
          pageNo: pageNo,
        },
      },
    );
    return res.data.data;
  }

  // 门店档案信息
  async getShops(pageNo: number) {
    const token = await this.authService.accessToken();
    const res = await axiosInstance.post(
      'https://cysms.wuuxiang.com/api/datatransfer/getshops',
      {},
      {
        headers: {
          accessid: process.env.ACCESS_ID,
          granttype: 'client',
          access_token: token,
        },
        params: {
          centerId: process.env.CENTER_ID,
          pageSize: 50,
          pageNo: pageNo,
        },
      },
    );
    return res.data.data;
  }

  async getItemCategoryInfo(pageNo: number) {
    const token = await this.authService.accessToken();
    const res = await axiosInstance.post(
      'https://cysms.wuuxiang.com/api/datatransfer/getitemcategoryinfo',
      {},
      {
        headers: {
          accessid: process.env.ACCESS_ID,
          granttype: 'client',
          access_token: token,
        },
        params: {
          centerId: process.env.CENTER_ID,
          pageSize: 50,
          pageNo: pageNo,
        },
      },
    );
    return res.data.data;
  }
}
