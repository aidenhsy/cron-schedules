import { MailerModule } from '@nestjs-modules/mailer';
import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    MailerModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        transport: {
          host: configService.get<string>('MAIL_STMP_HOST'),
          port: configService.get<number>('MAIL_STMP_PORT'),
          secure: true,
          auth: {
            user: configService.get<string>('MAIL_STMP_USER'),
            pass: configService.get<string>('MAIL_STMP_PASSWORD'),
          },
        },
        defaults: {
          from: configService.get<string>('MAIL_STMP_USER'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
