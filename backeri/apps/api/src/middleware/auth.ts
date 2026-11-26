import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { UserRole } from '@backeri/shared';
import { env } from '../config/env';
import { AppError } from './errorHandler';

export const AUTH_COOKIE_NAME = 'backeri_token';

export interface AuthPayload {
  userId: string;
  email: string;
  role: UserRole;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function signAuthToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '7d' });
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

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    req.user = decoded;
    next();
  } catch {
    next(new AppError(401, 'Invalid or expired session token', 'UNAUTHORIZED'));
  }
}

export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    } catch {
      // Ignore invalid optional token
    }
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
