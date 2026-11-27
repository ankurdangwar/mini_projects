import { NotificationChannel } from '@prisma/client';
import { formatMoney, formatSlotWindow } from '@backeri/shared';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { jobsService } from '../jobs/job.queues';
import type { NotificationJobPayload } from '../jobs/job.handlers';

export interface NotificationMessage {
  orderId?: string;
  channel: NotificationChannel;
  recipient: string;
  subject?: string;
  body: string;
}

export interface NotificationProvider {
  send(message: NotificationMessage): Promise<void>;
}

class SandboxNotificationProvider implements NotificationProvider {
  async send(message: NotificationMessage): Promise<void> {
    await prisma.notificationLog.create({
      data: {
        orderId: message.orderId,
        channel: message.channel,
        recipient: message.recipient,
        subject: message.subject,
        body: message.body,
        status: 'SENT',
      },
    });

    if (env.NODE_ENV !== 'test') {
      console.log(
        `[Notification:${message.channel}] To: ${message.recipient} | ${
          message.subject ? `${message.subject} — ` : ''
        }${message.body}`
      );
    }
  }
}

class NotificationService {
  private provider: NotificationProvider = new SandboxNotificationProvider();

  constructor() {
    jobsService.registerNotificationDispatcher((payload) =>
      this.dispatchBatch(payload)
    );
  }

  async dispatchBatch(
    payload: NotificationJobPayload
  ): Promise<{ dispatchedCount: number }> {
    for (const msg of payload.messages) {
      await this.provider.send(msg);
    }
    return { dispatchedCount: payload.messages.length };
  }

  private async enqueueOrFallback(payload: NotificationJobPayload): Promise<void> {
    try {
      await jobsService.enqueueNotification(payload);
    } catch (err) {
      if (env.NODE_ENV !== 'test') {
        console.error(
          '[Notification] Failed to enqueue on BullMQ, falling back to inline send:',
          err instanceof Error ? err.message : err
        );
      }
      await this.dispatchBatch(payload);
    }
  }

  async sendOrderConfirmation(order: {
    id: string;
    orderNumber: string;
    totalAmountCents: number;
    fulfillmentType: string;
    user: { email: string; phone: string | null; name: string };
    slot: { date: Date; startTime: string; endTime: string };
  }): Promise<void> {
    const dateStr = order.slot.date.toISOString().slice(0, 10);
    const windowStr = formatSlotWindow(order.slot.startTime, order.slot.endTime);
    const totalStr = formatMoney(order.totalAmountCents);

    const messages: NotificationMessage[] = [
      {
        orderId: order.id,
        channel: NotificationChannel.EMAIL,
        recipient: order.user.email,
        subject: `Order Confirmed: ${order.orderNumber} — Backeri`,
        body: `Hi ${order.user.name}, your ${order.fulfillmentType.toLowerCase()} order ${order.orderNumber} (${totalStr}) is confirmed for ${dateStr} (${windowStr}). Our bakers are preparing your batch!`,
      },
    ];

    if (order.user.phone) {
      messages.push({
        orderId: order.id,
        channel: NotificationChannel.SMS,
        recipient: order.user.phone,
        body: `Backeri: Order ${order.orderNumber} confirmed for ${dateStr} (${windowStr}). Total: ${totalStr}.`,
      });
    }

    await this.enqueueOrFallback({
      kind: 'order.confirmation',
      orderId: order.id,
      orderNumber: order.orderNumber,
      messages,
    });
  }

  async sendOrderReady(order: {
    id: string;
    orderNumber: string;
    fulfillmentType: string;
    user: { email: string; phone: string | null; name: string };
    slot: { date: Date; startTime: string; endTime: string };
  }): Promise<void> {
    const action =
      order.fulfillmentType === 'PICKUP'
        ? 'ready for pickup at the counter'
        : 'out for local delivery';

    const messages: NotificationMessage[] = [];

    if (order.user.phone) {
      messages.push({
        orderId: order.id,
        channel: NotificationChannel.SMS,
        recipient: order.user.phone,
        body: `Backeri: Fresh out of the oven! Order ${order.orderNumber} is ${action}.`,
      });
    }

    messages.push({
      orderId: order.id,
      channel: NotificationChannel.EMAIL,
      recipient: order.user.email,
      subject: `Ready Now: Order ${order.orderNumber} — Backeri`,
      body: `Hi ${order.user.name}, great news — your Backeri order ${order.orderNumber} is ${action}!`,
    });

    await this.enqueueOrFallback({
      kind: 'order.ready',
      orderId: order.id,
      orderNumber: order.orderNumber,
      messages,
    });
  }

  async sendOrderCancelled(order: {
    id: string;
    orderNumber: string;
    reason?: string;
    user: { email: string; phone: string | null; name: string };
  }): Promise<void> {
    await this.enqueueOrFallback({
      kind: 'order.cancelled',
      orderId: order.id,
      orderNumber: order.orderNumber,
      messages: [
        {
          orderId: order.id,
          channel: NotificationChannel.EMAIL,
          recipient: order.user.email,
          subject: `Order Cancelled & Refunded: ${order.orderNumber} — Backeri`,
          body: `Hi ${order.user.name}, your order ${order.orderNumber} has been cancelled${
            order.reason ? ` (${order.reason})` : ''
          }. Any payment captured has been automatically refunded.`,
        },
      ],
    });
  }

  async sendEmailVerification(params: {
    email: string;
    name: string;
    verifyUrl: string;
  }): Promise<void> {
    await this.enqueueOrFallback({
      kind: 'direct.message',
      messages: [
        {
          channel: NotificationChannel.EMAIL,
          recipient: params.email,
          subject: 'Verify your Backeri email address',
          body: `Hi ${params.name}, welcome to Backeri! Verify your email address by opening this link (valid for 24 hours): ${params.verifyUrl}`,
        },
      ],
    });
  }

  async sendPasswordReset(params: {
    email: string;
    name: string;
    resetUrl: string;
  }): Promise<void> {
    await this.enqueueOrFallback({
      kind: 'direct.message',
      messages: [
        {
          channel: NotificationChannel.EMAIL,
          recipient: params.email,
          subject: 'Reset your Backeri password',
          body: `Hi ${params.name}, we received a request to reset your Backeri password. Use this one-time link (valid for 1 hour): ${params.resetUrl}`,
        },
      ],
    });
  }
}

export const notificationService = new NotificationService();
