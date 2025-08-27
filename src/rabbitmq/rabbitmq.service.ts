import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Injectable } from '@nestjs/common';
import { getCurrentChinaTime } from '@saihu/common';

@Injectable()
export class RabbitmqService {
  constructor(private readonly amqp: AmqpConnection) {}

  async emitProcessed(event: string, msg: { id: string; aggregateId: string }) {
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
