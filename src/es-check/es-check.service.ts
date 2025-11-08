import { Injectable } from '@nestjs/common';
import { axiosInstance } from 'src/lib/axiosInstance';
import * as cheerio from 'cheerio';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MailService } from 'src/mail/mail.service';

type ScheduleEntry = {
  dateText: string; // e.g. "9/8(月)"
  weekdayClass?: string; // e.g. "mon"
  times: string[]; // e.g. ["11:00 ～ 16:00"]
};

@Injectable()
export class EsCheckService {
  constructor(private readonly mailService: MailService) {}
  private readonly miwaUrl = 'https://club-reika.com/cast/860272/';
  private readonly fdUrl = '';

  @Cron(CronExpression.EVERY_10_SECONDS)
  async checkMiwa() {
    const { data: html } = await axiosInstance.get(this.miwaUrl);

    const $ = cheerio.load(html);

    const nonEmpty: ScheduleEntry[] = [];

    $('ul.profile-weekly-schedule-list > li').each((_, li) => {
      const $li = $(li);

      // If it has ".weekly-time.time.empty", it's explicitly empty -> skip
      const isExplicitEmpty = $li.find('.weekly-time.time.empty').length > 0;
      if (isExplicitEmpty) return;

      // Extract date (e.g. "9/8(月)") and weekday class (mon/tue/…)
      const $date = $li.find('.weekly-date');
      const dateText = $date.text().trim();
      const weekdayClass = ($date.attr('class') || '')
        .split(/\s+/)
        .find((c) =>
          ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].includes(c),
        );

      // Collect any ".time" blocks inside ".weekly-time"
      const times = $li
        .find('.weekly-time .time')
        .map((__, t) => $(t).text().trim())
        .get()
        .filter(Boolean);

      // If there are times, it's non-empty; push it
      if (times.length > 0 || !isExplicitEmpty) {
        nonEmpty.push({ dateText, weekdayClass, times });
      }
    });

    if (nonEmpty.length > 0) {
      await this.mailService.sendMail({
        to: 'aiden@shaihukeji.com',
        subject: 'Test',
        text: 'Test',
        attachments: [],
      });
      console.log('mail sent');
    }

    return nonEmpty;
  }
}
