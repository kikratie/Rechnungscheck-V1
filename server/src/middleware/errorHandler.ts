import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';
import { ZodError } from 'zod';
import type { ApiResponse } from '@buchungsai/shared';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  // Zod Validierungsfehler
  if (err instanceof ZodError) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validierungsfehler',
        details: err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      },
    };
    res.status(422).json(response);
    return;
  }

  // Eigene AppError-Klassen
  if (err instanceof AppError) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    };
    res.status(err.statusCode).json(response);
    return;
  }

  // Multer Fehler (Datei zu groß etc.)
  if (err.message?.includes('File too large')) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'FILE_TOO_LARGE',
        message: 'Datei ist zu groß (max. 20 MB)',
      },
    };
    res.status(413).json(response);
    return;
  }

  // Unbekannte Fehler
  console.error('Unhandled error:', err);

  const response: ApiResponse = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message:
        process.env.NODE_ENV === 'development'
          ? err.message
          : 'Ein interner Fehler ist aufgetreten',
    },
  };
  res.status(500).json(response);
}
