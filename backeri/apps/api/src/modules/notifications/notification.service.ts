import { NotificationChannel } from '@prisma/client';
import { formatMoney, formatSlotWindow } from '@backeri/shared';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';

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

    await this.provider.send({
      orderId: order.id,
      channel: NotificationChannel.EMAIL,
      recipient: order.user.email,
      subject: `Order Confirmed: ${order.orderNumber} — Backeri`,
      body: `Hi ${order.user.name}, your ${order.fulfillmentType.toLowerCase()} order ${order.orderNumber} (${totalStr}) is confirmed for ${dateStr} (${windowStr}). Our bakers are preparing your batch!`,
    });

    if (order.user.phone) {
      await this.provider.send({
        orderId: order.id,
        channel: NotificationChannel.SMS,
        recipient: order.user.phone,
        body: `Backeri: Order ${order.orderNumber} confirmed for ${dateStr} (${windowStr}). Total: ${totalStr}.`,
      });
    }
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

    if (order.user.phone) {
      await this.provider.send({
        orderId: order.id,
        channel: NotificationChannel.SMS,
        recipient: order.user.phone,
        body: `Backeri: Fresh out of the oven! Order ${order.orderNumber} is ${action}.`,
      });
    }

    await this.provider.send({
      orderId: order.id,
      channel: NotificationChannel.EMAIL,
      recipient: order.user.email,
      subject: `Ready Now: Order ${order.orderNumber} — Backeri`,
      body: `Hi ${order.user.name}, great news — your Backeri order ${order.orderNumber} is ${action}!`,
    });
  }

  async sendOrderCancelled(order: {
    id: string;
    orderNumber: string;
    reason?: string;
    user: { email: string; phone: string | null; name: string };
  }): Promise<void> {
    await this.provider.send({
      orderId: order.id,
      channel: NotificationChannel.EMAIL,
      recipient: order.user.email,
      subject: `Order Cancelled & Refunded: ${order.orderNumber} — Backeri`,
      body: `Hi ${order.user.name}, your order ${order.orderNumber} has been cancelled${
        order.reason ? ` (${order.reason})` : ''
      }. Any payment captured has been automatically refunded.`,
    });
  }
}

export const notificationService = new NotificationService();
