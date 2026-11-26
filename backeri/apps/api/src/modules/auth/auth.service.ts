import bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import { signAuthToken } from '../../middleware/auth';

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
      throw new AppError(409, 'An account with this email already exists', 'EMAIL_EXISTS');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        name: input.name.trim(),
        phone: input.phone?.trim(),
        passwordHash,
        role: UserRole.CUSTOMER,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });

    const token = signAuthToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    return { user, token };
  },

  async login(input: { email: string; password: string }) {
    const email = input.email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
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
        createdAt: user.createdAt,
      },
      token,
    };
  },

  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });
    if (!user) {
      throw new AppError(404, 'User not found', 'NOT_FOUND');
    }
    return user;
  },
};
