import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';

@Module({
  imports: [
    ConfigModule,
    RabbitMQModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('RABBIT_URI_INTERLOP'),
        connectionInitOptions: { wait: true, timeout: 30000 },
        exchanges: [
          { name: 'order', type: 'topic', options: { durable: true } },
        ],
      }),
    }),
  ],
  exports: [RabbitMQModule],
})
export class RabbitmqModule {}
