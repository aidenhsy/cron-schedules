export class SyncDailyBillsDto {
  start_date: string;
  end_date: string;
  shop_id?: number;
  status?: number;
  skip_syned_item?: boolean;
}
