import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';
import { SendMailDto } from './mail.types';

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) {}

  async sendMail(sendMailDto: SendMailDto) {
    await this.mailerService.sendMail(sendMailDto);
  }
}
