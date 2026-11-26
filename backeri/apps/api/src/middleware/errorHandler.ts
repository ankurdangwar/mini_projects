import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    statusCode: number,
    message: string,
    code = 'APP_ERROR',
    details?: unknown
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        details: err.flatten(),
      },
    });
    return;
  }

  const prismaErr = err as { code?: string; meta?: unknown; message?: string };
  if (prismaErr?.code === 'P2002') {
    res.status(409).json({
      error: {
        code: 'CONFLICT',
        message: 'A record with this unique value already exists.',
        details: prismaErr.meta,
      },
    });
    return;
  }

  if (prismaErr?.code === 'P2025') {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Requested resource was not found.',
      },
    });
    return;
  }

  console.error('[API Error]', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected server error occurred.',
    },
  });
}
