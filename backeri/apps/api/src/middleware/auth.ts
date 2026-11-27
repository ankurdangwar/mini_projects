import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { UserRole } from '@backeri/shared';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import { AppError } from './errorHandler';

export const AUTH_COOKIE_NAME = 'backeri_token';
export const AUTH_USER_CACHE_TTL_SECONDS = 60;

export interface AuthPayload {
  userId: string;
  email: string;
  role: UserRole;
  name: string;
}

interface CachedAuthUser {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  isActive: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function authUserCacheKey(userId: string): string {
  return `auth:user:${userId}`;
}

export async function invalidateAuthUserCache(userId: string): Promise<void> {
  try {
    await redis.del(authUserCacheKey(userId));
  } catch {
    // Non-fatal if Redis is temporarily unavailable
  }
}

async function resolveActiveUser(userId: string): Promise<CachedAuthUser | null> {
  const key = authUserCacheKey(userId);

  try {
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached) as CachedAuthUser;
    }
  } catch {
    // Fall back to PostgreSQL on Redis read error
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, name: true, isActive: true },
  });

  if (!dbUser) {
    return null;
  }

  const snapshot: CachedAuthUser = {
    id: dbUser.id,
    email: dbUser.email,
    role: dbUser.role,
    name: dbUser.name,
    isActive: dbUser.isActive,
  };

  try {
    await redis.set(
      key,
      JSON.stringify(snapshot),
      'EX',
      AUTH_USER_CACHE_TTL_SECONDS
    );
  } catch {
    // Non-fatal if Redis write fails
  }

  return snapshot;
}

export function signAuthToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '7d',
  });
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function extractToken(req: Request): string | null {
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];
  if (cookieToken && typeof cookieToken === 'string') {
    return cookieToken;
  }

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  return null;
}

export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const token = extractToken(req);
  if (!token) {
    return next(new AppError(401, 'Authentication required', 'UNAUTHORIZED'));
  }

  let decoded: AuthPayload;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256'],
    }) as AuthPayload;
  } catch {
    return next(
      new AppError(401, 'Invalid or expired session token', 'UNAUTHORIZED')
    );
  }

  // Resolve active status & latest role via 60s Redis cache (evicted on staff disable/role change)
  resolveActiveUser(decoded.userId)
    .then((user) => {
      if (!user || !user.isActive) {
        return next(
          new AppError(
            401,
            'Account is disabled or no longer exists',
            'ACCOUNT_DISABLED'
          )
        );
      }
      req.user = {
        userId: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      };
      next();
    })
    .catch(next);
}

export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const token = extractToken(req);
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256'],
    }) as AuthPayload;
    req.user = decoded;
  } catch {
    // Ignore invalid optional token
  }
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError(401, 'Authentication required', 'UNAUTHORIZED'));
    }
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(
          403,
          `Access denied. Requires role: ${roles.join(' or ')}`,
          'FORBIDDEN'
        )
      );
    }
    next();
  };
}
