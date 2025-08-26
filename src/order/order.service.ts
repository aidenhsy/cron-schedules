import { AmqpConnection, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';
import { getCurrentChinaTime } from '@saihu/common';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly amqp: AmqpConnection,
  ) {}

  @RabbitSubscribe({
    exchange: 'order',
    routingKey: 'order.delivered',
    queue: 'q.order.delivered.scheduler',
    queueOptions: { durable: true },
  })
  async finishOrder(msg: { id: string; aggregateId: string; payload: any }) {
    const { id, aggregateId, payload } = msg;
    console.log(payload);
    await this.emitProcessed('order.delivered', {
      id,
      aggregateId,
    });
  }

  private async emitProcessed(
    event: string,
    msg: { id: string; aggregateId: string },
  ) {
    // completion event pattern
    await this.amqp.publish(
      'order',
      `${event}.processed.order`,
      {
        messageId: msg.id, // original outbox id
        aggregateId: msg.aggregateId,
        processedAt: getCurrentChinaTime(),
      },
      { messageId: msg.id },
    );
  }
}
