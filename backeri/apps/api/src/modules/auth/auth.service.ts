import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { AuthTokenType, UserRole } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import { invalidateAuthUserCache, signAuthToken } from '../../middleware/auth';
import { notificationService } from '../notifications/notification.service';

const USER_PUBLIC_SELECT = {
  id: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  isActive: true,
  emailVerified: true,
  createdAt: true,
} as const;

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function getWebOrigin(): string {
  return env.CORS_ORIGIN.split(',')[0]?.trim() || 'http://localhost:3000';
}

async function issueAuthToken(
  userId: string,
  type: AuthTokenType,
  ttlMs: number
): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);

  // Invalidate prior unused tokens of the same type for this user
  await prisma.authToken.updateMany({
    where: { userId, type, usedAt: null },
    data: { usedAt: new Date() },
  });

  await prisma.authToken.create({
    data: {
      userId,
      type,
      tokenHash,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });

  return rawToken;
}

export const authService = {
  async register(input: {
    email: string;
    password: string;
    name: string;
    phone?: string;
  }) {
    const email = input.email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError(
        409,
        'An account with this email already exists',
        'EMAIL_EXISTS'
      );
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        name: input.name.trim(),
        phone: input.phone?.trim(),
        passwordHash,
        role: UserRole.CUSTOMER,
        isActive: true,
        emailVerified: false,
      },
      select: USER_PUBLIC_SELECT,
    });

    // Issue 24h email verification token & dispatch asynchronously via BullMQ
    const rawVerifyToken = await issueAuthToken(
      user.id,
      AuthTokenType.EMAIL_VERIFY,
      24 * 60 * 60 * 1000
    );
    const verifyUrl = `${getWebOrigin()}/verify-email?token=${rawVerifyToken}`;
    await notificationService.sendEmailVerification({
      email: user.email,
      name: user.name,
      verifyUrl,
    });

    const token = signAuthToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    return {
      user,
      token,
      // Exposed only in non-production sandbox mode for convenient local testing
      ...(env.NODE_ENV !== 'production' ? { verificationToken: rawVerifyToken } : {}),
    };
  },

  async login(input: { email: string; password: string }) {
    const email = input.email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }

    if (!user.isActive) {
      throw new AppError(
        403,
        'This account has been disabled by an administrator.',
        'ACCOUNT_DISABLED'
      );
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const token = signAuthToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      },
      token,
    };
  },

  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: USER_PUBLIC_SELECT,
    });
    if (!user) {
      throw new AppError(404, 'User not found', 'NOT_FOUND');
    }
    return user;
  },

  async resendVerificationEmail(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError(404, 'User not found', 'NOT_FOUND');
    }
    if (user.emailVerified) {
      return { alreadyVerified: true };
    }

    const rawVerifyToken = await issueAuthToken(
      user.id,
      AuthTokenType.EMAIL_VERIFY,
      24 * 60 * 60 * 1000
    );
    const verifyUrl = `${getWebOrigin()}/verify-email?token=${rawVerifyToken}`;
    await notificationService.sendEmailVerification({
      email: user.email,
      name: user.name,
      verifyUrl,
    });

    return {
      sent: true,
      ...(env.NODE_ENV !== 'production' ? { verificationToken: rawVerifyToken } : {}),
    };
  },

  async verifyEmail(rawToken: string) {
    const tokenHash = hashToken(rawToken);
    const record = await prisma.authToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !record ||
      record.type !== AuthTokenType.EMAIL_VERIFY ||
      record.usedAt !== null ||
      record.expiresAt.getTime() < Date.now()
    ) {
      throw new AppError(
        400,
        'Verification link is invalid or has expired.',
        'INVALID_TOKEN'
      );
    }

    await prisma.$transaction([
      prisma.authToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: record.userId },
        data: { emailVerified: true },
      }),
    ]);

    return { verified: true, email: record.user.email };
  },

  async requestPasswordReset(emailInput: string) {
    const email = emailInput.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email } });

    // Always return generic OK to avoid email enumeration
    if (!user || !user.isActive) {
      return {
        ok: true,
        message:
          'If an active account exists for that email, a password reset link has been sent.',
      };
    }

    const rawResetToken = await issueAuthToken(
      user.id,
      AuthTokenType.PASSWORD_RESET,
      60 * 60 * 1000 // 1 hour
    );
    const resetUrl = `${getWebOrigin()}/reset-password?token=${rawResetToken}`;
    await notificationService.sendPasswordReset({
      email: user.email,
      name: user.name,
      resetUrl,
    });

    return {
      ok: true,
      message:
        'If an active account exists for that email, a password reset link has been sent.',
      ...(env.NODE_ENV !== 'production' ? { devResetToken: rawResetToken } : {}),
    };
  },

  async resetPassword(rawToken: string, newPassword: string) {
    const tokenHash = hashToken(rawToken);
    const record = await prisma.authToken.findUnique({
      where: { tokenHash },
    });

    if (
      !record ||
      record.type !== AuthTokenType.PASSWORD_RESET ||
      record.usedAt !== null ||
      record.expiresAt.getTime() < Date.now()
    ) {
      throw new AppError(
        400,
        'Password reset link is invalid or has expired.',
        'INVALID_TOKEN'
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.$transaction([
      prisma.authToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
    ]);

    await invalidateAuthUserCache(record.userId);

    return { reset: true };
  },

  // --- Admin Staff Management ---
  async listStaff() {
    return prisma.user.findMany({
      where: { role: { in: [UserRole.BAKER, UserRole.ADMIN] } },
      select: USER_PUBLIC_SELECT,
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
  },

  async createStaff(input: {
    email: string;
    name: string;
    phone?: string;
    password: string;
    role: 'BAKER' | 'ADMIN';
  }) {
    const email = input.email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError(
        409,
        'A user with this email already exists',
        'EMAIL_EXISTS'
      );
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    return prisma.user.create({
      data: {
        email,
        name: input.name.trim(),
        phone: input.phone?.trim(),
        passwordHash,
        role: input.role === 'ADMIN' ? UserRole.ADMIN : UserRole.BAKER,
        isActive: true,
        emailVerified: true,
      },
      select: USER_PUBLIC_SELECT,
    });
  },

  async updateStaff(
    staffId: string,
    actorId: string,
    data: {
      name?: string;
      phone?: string | null;
      role?: 'BAKER' | 'ADMIN';
      isActive?: boolean;
      password?: string;
    }
  ) {
    const target = await prisma.user.findUnique({ where: { id: staffId } });
    if (!target || target.role === UserRole.CUSTOMER) {
      throw new AppError(404, 'Staff member not found', 'STAFF_NOT_FOUND');
    }

    if (staffId === actorId) {
      if (data.isActive === false) {
        throw new AppError(
          400,
          'You cannot disable your own admin account.',
          'SELF_DISABLE_FORBIDDEN'
        );
      }
      if (data.role && data.role !== 'ADMIN') {
        throw new AppError(
          400,
          'You cannot demote your own admin account.',
          'SELF_DEMOTE_FORBIDDEN'
        );
      }
    }

    const passwordHash = data.password
      ? await bcrypt.hash(data.password, 10)
      : undefined;

    const updated = await prisma.user.update({
      where: { id: staffId },
      data: {
        name: data.name?.trim(),
        phone: data.phone === undefined ? undefined : data.phone?.trim() || null,
        role: data.role
          ? data.role === 'ADMIN'
            ? UserRole.ADMIN
            : UserRole.BAKER
          : undefined,
        isActive: data.isActive,
        passwordHash,
      },
      select: USER_PUBLIC_SELECT,
    });

    // Evict cached auth snapshot so disable/role changes take effect on the very next request
    await invalidateAuthUserCache(staffId);

    return updated;
  },
};
