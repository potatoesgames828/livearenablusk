import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_MESSAGES, type ErrorCode } from '@live-arena/shared';

/** Erro de aplicação com código estável e mensagem compreensível. */
export class AppError extends HttpException {
  constructor(
    readonly code: ErrorCode,
    status: HttpStatus,
    message?: string,
    readonly details?: unknown,
  ) {
    super({ code, message: message ?? ERROR_MESSAGES[code], details }, status);
  }
}

export const Errors = {
  notFound: (msg?: string) => new AppError('NOT_FOUND', HttpStatus.NOT_FOUND, msg),
  forbidden: (msg?: string) => new AppError('FORBIDDEN', HttpStatus.FORBIDDEN, msg),
  unauthorized: (code: ErrorCode = 'AUTH_REQUIRED', msg?: string) => new AppError(code, HttpStatus.UNAUTHORIZED, msg),
  validation: (details?: unknown, msg?: string) => new AppError('VALIDATION', HttpStatus.BAD_REQUEST, msg, details),
  conflict: (code: ErrorCode, msg?: string, details?: unknown) => new AppError(code, HttpStatus.CONFLICT, msg, details),
  planLimit: (msg?: string) => new AppError('PLAN_LIMIT', HttpStatus.PAYMENT_REQUIRED, msg),
  rateLimited: (msg?: string) => new AppError('RATE_LIMITED', HttpStatus.TOO_MANY_REQUESTS, msg),
  unavailable: (code: ErrorCode, msg?: string) => new AppError(code, HttpStatus.SERVICE_UNAVAILABLE, msg),
};
