import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { OperationService } from 'src/tcsl/业务数据/业务数据.service';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
import { BaseError } from '@saihu/common';
import pLimit from 'p-limit';
import * as fs from 'fs';
import * as path from 'path';
import { SyncDailyBillsDto } from './dto/sync-daily-billls.dto';
import { Cron, CronExpression } from '@nestjs/schedule';

dayjs.extend(utc);
dayjs.extend(timezone);
@Injectable()
export class DailyBillsService {
  private readonly logger = new Logger(DailyBillsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly operationService: OperationService,
  ) {}

  // @Cron(CronExpression.EVERY_DAY_AT_1AM, {
  //   timeZone: 'Asia/Shanghai',
  // })
  async syncDailyBillsCron() {
    const yesterday = dayjs()
      .tz('Asia/Shanghai')
      .subtract(1, 'day')
      .format('YYYY-MM-DD');
    this.logger.log(
      `sync daily bills at ${yesterday}, today is ${dayjs().tz('Asia/Shanghai').format('YYYY-MM-DD')}`,
    );
    await this.syncDailyBills({
      start_date: yesterday,
      end_date: yesterday,
    });
  }

  async syncDailyBills(syncDto: SyncDailyBillsDto) {
    await this.writeErrorLogs(
      { message: 'sync start startDate', params: syncDto },
      'sync.log',
    );
    const startTime = dayjs();
    this.logger.log(`sync start at ${startTime.format()}`);
    const shops = await this.db.devImbasic.scm_shop.findMany({
      where: {
        tc_shop_id: {
          not: 0,
        },
        ...(syncDto.status ? { status: syncDto.status } : {}),
        ...(syncDto.shop_id ? { id: Number(syncDto.shop_id) } : {}),
      },
    });
    const result = {};
    const dateArray = this.getDateRangeWithDayjs(
      syncDto.start_date,
      syncDto.end_date,
    );
    // 每个日期最多并发2个请求
    const limit = pLimit(2);
    const dateSyncResult: { date: string; status: string }[] = [];
    const errorSyncResult: {
      date: string;
      shop: string;
      id: number;
      brand_id: number;
      tc_id: number;
    }[] = [];

    // 创建所有需要同步的任务
    interface SyncTask {
      date: string;
      shop: any;
      task: () => Promise<{
        success: boolean;
        date: string;
        shop: string;
        data?: number;
        error?: string;
      }>;
    }
    const syncTasks: SyncTask[] = [];
    for (const date of dateArray) {
      const shopCount = shops.length;
      for (const [index, shop] of shops.entries()) {
        if (!shop.tc_shop_id || shop.tc_shop_id === 0) {
          continue;
        }
        syncTasks.push({
          date,
          shop,
          task: () =>
            limit(async () => {
              this.logger.log(
                `sync shop ${shop.shop_name} ${index + 1}/${shopCount}, date ${date} start`,
              );
              try {
                const syncResult = await this.doSyncDailyBills({
                  dayStr: date,
                  shop: {
                    shop_name: shop.shop_name,
                    id: shop.id,
                    brand_id: shop.brand_id!,
                    tc_shop_id: shop.tc_shop_id!,
                  },
                  skip_syned_item: syncDto.skip_syned_item,
                });
                this.logger.log(
                  `sync shop ${shop.shop_name} ${index}/${shopCount}, date ${date} end`,
                );
                return {
                  success: true,
                  date,
                  shop: shop.shop_name,
                  data: syncResult,
                };
              } catch (error) {
                // 异常后，等待1秒 一般是接口调用频率过快
                await this.sleep(1000);
                this.logger.log(
                  `sync shop ${shop.shop_name}, date ${date} error:`,
                  error.message,
                );
                const logItem = {
                  date,
                  shop: shop.shop_name,
                  id: shop.id,
                  brand_id: shop.brand_id!,
                  tc_id: shop.tc_shop_id!,
                };
                errorSyncResult.push(logItem);
                return {
                  success: false,
                  date,
                  shop: shop.shop_name,
                  error: error.message,
                };
              }
            }),
        });
      }
    }

    // 并发执行所有任务
    const results = await Promise.all(syncTasks.map((task) => task.task()));

    // 聚合结果
    for (const res of results) {
      if (res.success) {
        const shopResult = result[res.shop] || [];
        shopResult.push({ date: res.date, data: res.data });
        result[res.shop] = shopResult;
      }
    }

    // 统计日期同步状态
    const dateStatusMap = new Map();
    for (const res of results) {
      if (!dateStatusMap.has(res.date)) {
        dateStatusMap.set(res.date, { ok: 0, error: 0 });
      }
      const status = dateStatusMap.get(res.date);
      if (res.success) {
        status.ok++;
      } else {
        status.error++;
      }
    }

    for (const [date, status] of dateStatusMap.entries()) {
      dateSyncResult.push({
        date,
        status: status.error > 0 ? 'partial_error' : 'ok',
      });
    }

    this.logger.log('Date sync result:', dateSyncResult);
    this.logger.log('Error sync result:', errorSyncResult);
    const endErrorLogs: {
      date: string;
      shop: string;
      id: number;
    }[] = [];
    // 将错误同步结果写入日志文件
    if (errorSyncResult.length > 0) {
      // await this.writeErrorLogs(errorSyncResult);
      for (const [index, syncErrItem] of errorSyncResult.entries()) {
        this.logger.log(
          `sync errorList ${index + 1}/${errorSyncResult.length}, shop ${syncErrItem.shop}, date ${syncErrItem.date} start`,
        );
        try {
          await this.doSyncDailyBills({
            dayStr: syncErrItem.date,
            shop: {
              shop_name: syncErrItem.shop,
              id: syncErrItem.id,
              brand_id: syncErrItem.brand_id,
              tc_shop_id: syncErrItem.tc_id,
            },
          });
          this.logger.log(
            `sync errorList shop ${syncErrItem.shop}, date ${syncErrItem.date} end`,
          );
        } catch (error) {
          await this.writeErrorLogs(syncErrItem, 'sync.log');
          endErrorLogs.push(syncErrItem);
        }
      }
    }

    if (endErrorLogs.length > 0) {
      await this.writeErrorLogs(endErrorLogs, 'sync.log');
    }
    const endTime = dayjs();
    await this.writeErrorLogs(
      { message: 'sync end', startTime, endTime },
      'sync.log',
    );

    const duration = endTime.diff(startTime, 'millisecond');
    this.logger.log(`sync end, duration: ${duration / 1000} s`);

    return {
      result,
      // dateSyncResult,
      endErrorLogs,
    };
  }

  private async doSyncDailyBills(syncDto: {
    dayStr: string;
    shop: {
      shop_name: string;
      id: number;
      brand_id: number;
      tc_shop_id: number;
    };
    skip_syned_item?: boolean;
  }) {
    const date = dayjs.tz(syncDto.dayStr, 'UTC').toDate();
    const foundItem = await this.db.devOrderService.st_daily_sales.upsert({
      where: {
        shop_id_date_string: {
          shop_id: syncDto.shop.id,
          date_string: syncDto.dayStr,
        },
      },
      update: {},
      create: {
        date: date,
        shop_id: syncDto.shop.id,
        date_string: syncDto.dayStr,
        brand_id: syncDto.shop.brand_id,
        dayofweek: date.getDay(),
        sync_status: 0,
      },
    });

    if (syncDto.skip_syned_item && foundItem.sync_status === 1) {
      return 0;
    }

    await this.db.devOrderService.st_daily_sales.update({
      where: {
        shop_id_date_string: {
          shop_id: syncDto.shop.id,
          date_string: syncDto.dayStr,
        },
      },
      data: {
        sync_status: 0,
      },
    });

    await this.db.devOrderService.st_daily_sales_detail.deleteMany({
      where: {
        daily_sales_id: foundItem.id,
      },
    });
    await this.db.devOrderService.st_settle_details.deleteMany({
      where: {
        daily_sales_id: foundItem.id,
      },
    });
    await this.db.devOrderService.st_bill_list.deleteMany({
      where: {
        daily_sales_id: foundItem.id,
      },
    });
    let hasMore = true;
    let pageNo = 1;
    let total = 0;
    const billIdMap = new Map<string, number>();
    while (hasMore) {
      const res = await this.operationService.getSerialData(
        pageNo,
        syncDto.shop.tc_shop_id,
        syncDto.dayStr,
      );

      const billListRes = res.billList || [];
      // 根据bs_id去重
      const billList = billListRes.filter((item: any) => {
        if (billIdMap.has(item.bs_id)) return false;
        billIdMap.set(item.bs_id, 1);
        return true;
      });
      if (billList.length > 0) {
        total += billList.length;
        const billDetails = this.getBillListRemap(billList, foundItem);
        const saleDetails = this.getSaleDetails(billList, foundItem);
        const settleDetails = this.getSettleDetails(billList, foundItem);

        try {
          await this.db.devOrderService.st_bill_list.createMany({
            data: billDetails,
          });
        } catch (error) {
          await this.writeErrorLogs(billDetails, 'sync_bill_list.log');
          throw error;
        }

        try {
          await this.db.devOrderService.st_daily_sales_detail.createMany({
            data: saleDetails,
          });
        } catch (error) {
          await this.writeErrorLogs(saleDetails, 'sync_daily_sales_detail.log');
          throw error;
        }
        try {
          await this.db.devOrderService.st_settle_details.createMany({
            data: settleDetails,
          });
        } catch (error) {
          await this.writeErrorLogs(settleDetails, 'sync_settle_details.log');
          throw error;
        }
        // this.logger.log(`syncd page ${pageNo}, total page ${res.pageInfo.pageTotal}`);
      }
      if (res.pageInfo.pageNo < res.pageInfo.pageTotal) {
        pageNo++;
      } else {
        hasMore = false;
      }
    }
    await this.db.devOrderService.st_daily_sales.update({
      where: {
        id: foundItem.id,
      },
      data: {
        sync_status: 1,
      },
    });
    return total;
  }

  getDateRangeWithDayjs(startDateStr: string, endDateStr: string) {
    // 校验日期格式
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDateStr) || !dateRegex.test(endDateStr)) {
      throw new BaseError(400, '日期格式必须为 YYYY-MM-DD');
    }

    // 解析日期
    const startDate = dayjs(startDateStr);
    const endDate = dayjs(endDateStr);

    // 校验日期有效性
    if (!startDate.isValid() || !endDate.isValid()) {
      throw new BaseError(400, '无效的日期');
    }

    // 校验开始日期是否小于结束日期
    if (startDate.isAfter(endDate)) {
      throw new BaseError(400, '开始日期必须小于结束日期');
    }

    // 生成日期数组
    const dateArray: string[] = [];
    let currentDate = startDate;

    while (currentDate.isBefore(endDate) || currentDate.isSame(endDate)) {
      dateArray.push(currentDate.format('YYYY-MM-DD'));
      currentDate = currentDate.add(1, 'day');
    }

    return dateArray;
  }

  private getBillListRemap(billList: any[], foundItem: any) {
    return billList.map((item: any) => ({
      daily_sales_id: foundItem.id,
      bs_id: item.bs_id,
      bs_code: item.bs_code,
      ts_code: item.ts_code,
      owo_open_id: item.owo_open_id,
      owo_union_id: item.owo_union_id,
      btpw_user_account: item.btpw_user_account,
      area_code: item.area_code,
      area_id: item.area_id?.toString() || null,
      area_name: item.area_name,
      point_code: item.point_code,
      point_name: item.point_name,
      people_qty: item.people_qty,
      open_time: dayjs(item.open_time).format(),
      settle_time: dayjs(item.settle_time).format(),
      settleman_id: item.settleMan_id,
      settleman_name: item.settleMan_name,
      settle_shift_id: item.settle_shift_id,
      settle_biz_date: item.settle_biz_date
        ? dayjs(item.settle_biz_date).format()
        : null,
      settle_biz_month: item.settle_biz_month,
      state: Number(item.state) || null,
      trt_user_id: item.trt_user_id,
      waiter_code: item.waiter_code,
      waiter_name: item.waiter_name,
      trt_salesman_id: item.trt_salesman_id,
      salesman_code: item.salesman_code,
      salesman_name: item.salesman_name,
      item_income_total: item.item_income_total,
      item_orig_money: item.item_orig_money,
      orig_server_fee: item.orig_server_fee,
      orig_zdxfbq: item.orig_zdxfbq,
      orig_total: item.orig_total,
      disc_total: item.disc_total,
      disc_money: item.disc_money,
      quota_money: item.quota_money,
      present_money: item.present_money,
      member_money: item.member_money,
      promote_money: item.promote_money,
      wipe_money: item.wipe_money,
      income_total: item.income_total,
      not_income_money: item.not_income_money,
      sale_type_id: item.sale_type_id,
      sale_type_name: item.sale_type_name,
      order_origin_id: item.order_origin_id,
      order_origin_name: item.order_origin_name,
      dinner_type_id: item.dinner_type_id,
      dinner_type_name: item.dinner_type_name,
      settle_state: item.settle_state ? item.settle_state.toString() : null,
      order_type: item.order_type,
      de_from: item.de_from,
      is_continued_bill: item.is_continued_bill,
      is_continued_bill_name: item.is_continued_bill_name,
      tax_money: item.tax_money,
      order_code: item.order_code,
      center_code: item.center_code,
      center_name: item.center_name,
      brand_code: item.brand_code,
      brand_name: item.brand_name,
      shop_code: item.shop_code,
      shop_id: item.shop_id,
      shop_out_code: item.shop_out_code,
      shop_name: item.shop_name,
      last_total: item.last_total,
      is_give_invoice: item.is_give_invoice,
      invoice_no: item.invoice_no,
      invoice_code: item.invoice_code,
      invoice_remark: item.invoice_remark,
      create_time: dayjs(item.create_time).format(),
      modify_time: dayjs(item.modify_time).format(),
      bs_remark: item.bs_remark,
      team_id: item.team_id,
      pos_id: item.pos_id,
      pos_code: item.pos_code,
      pos_name: item.pos_name,
      orig_wd_bs_id: item.orig_wd_bs_id,
      orig_wd_bs_code: item.orig_wd_bs_code,
      accountbillstate: item.accountBillState,
      sn: item.sn,
      give_change: item.give_change,
      de_no: item.de_no,
      delivery_time: item.delivery_time && dayjs(item.delivery_time).format(),
      service_fee: item.service_fee,
      gde_member_id: item.gde_member_id,
      member_card_no: item.member_card_no,
      member_id: item.member_id,
      member_name: item.member_name,
      member_mobile: item.member_mobile,
      card_kind_name: item.card_kind_name,
      service_fee_income_money: item.service_fee_income_money,
      service_fee_not_income_money: item.service_fee_not_income_money,
      service_fee_last_total: item.service_fee_last_total,
      zdxf_income_money: item.zdxf_income_money,
      third_serial: item.third_serial,
      table_qty: item.table_qty,
      crm_ts_code: item.crm_ts_code,
      third_member_id: item.third_member_id,
      third_member_mobile: item.third_member_mobile,
      children_qty: item.children_qty,
      delflg: item.delflg,
    }));
  }

  private getSaleDetails(billList: any[], foundItem: any) {
    return billList
      .map((bill: any) =>
        bill.item
          .map((i: any) => ({
            daily_sales_id: foundItem.id,
            bs_id: i.bs_id,
            qty: i.last_qty,
            item_id: i.item_id,
            sale_price: i.sale_price,
            orig_price: i.orig_price,
            orig_qty: i.orig_qty,
            create_time: new Date(i.create_time),
            deflag: i.deflag,
            small_class_id: i.small_class_id,
            unit_name: i.unit_name,
            not_income_money: i.not_income_money,
            unit_id: i.unit_id,
            item_name: i.item_name,
            small_class_name: i.small_class_name,
            last_price: i.last_price,
            orig_subtotal: i.orig_subtotal,
            income_money: i.income_money,
            pkg_flg: i.pkg_flg,
          }))
          .flat(),
      )
      .flat();
  }

  private getSettleDetails(
    billList: any,
    foundItem: {
      brand_id: number | null;
      id: string;
      date: Date | null;
      shop_id: number | null;
      date_string: string | null;
      dayofweek: number | null;
    },
  ) {
    return billList
      .map((bill: any) =>
        bill.settleDetail.map((detail: any) => ({
          daily_sales_id: foundItem.id,
          ts_id: detail.ts_id,
          payway_code: detail.payway_code,
          payway_id: detail.payway_id,
          modify_time: detail.modify_time,
          payway_name: detail.payway_name,
          pay_money: detail.pay_money,
          payway_remark: detail.payway_remark,
          income_money: detail.income_money,
          delflg: detail.delflg,
          settle_state: detail.settle_state,
          pw_id: detail.pw_id,
          payway_out_code: detail.payway_out_code,
          bs_id: detail.bs_id,
          consumer_name: detail.consumer_name,
          card_no: detail.card_no,
          consumer_code: detail.consumer_code,
          crm_mobile: detail.crm_mobile,
          not_income_money: detail.not_income_money,
        })),
      )
      .flat()
      .map((item: any) => ({
        ...item,
        daily_sales_id: foundItem.id,
        payway_id: item.payway_id?.toString() || null,
        modify_time: item.modify_time?.toString() || null,
      }));
  }
  private sleep(ms: number): Promise<void> {
    return new Promise((res) => setTimeout(res, ms));
  }

  // 将错误同步结果写入日志文件
  private async writeErrorLogs(
    errorSyncResult: any,
    logfileName: string,
  ): Promise<void> {
    try {
      // 确保logs目录存在
      const logsDir = path.join(process.cwd(), 'logs');
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      // 日志文件路径
      const logFilePath = path.join(logsDir, logfileName);

      // 准备日志内容
      const timestamp = new Date().toISOString();
      const logContent = `[${timestamp}] Sync Result:\n${JSON.stringify(errorSyncResult, null, 1)}\n\n`;

      // 追加写入日志文件
      fs.appendFileSync(logFilePath, logContent, 'utf8');
      this.logger.log(`sync results have been written to ${logFilePath}`);
    } catch (error) {
      this.logger.error('Failed to write error sync logs:', error);
    }
  }
}
