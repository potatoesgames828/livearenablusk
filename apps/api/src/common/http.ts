import {
  Catch,
  HttpException,
  HttpStatus,
  Injectable,
  type ArgumentsHost,
  type ExceptionFilter,
  type NestMiddleware,
  type PipeTransform,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { ZodSchema } from 'zod';
import { ERROR_MESSAGES, type ApiErrorBody, type ErrorCode } from '@live-arena/shared';
import { metrics } from '@live-arena/observability';
import { Errors } from './errors';
import type { AuthedRequest } from './auth';
import type { Logger } from '@live-arena/observability';

/** Validação de corpo/consulta com zod. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}
  transform(value: unknown): T {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw Errors.validation(r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    }
    return r.data;
  }
}

/** Filtro único de erros: formato consistente e sem vazar detalhes internos. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<AuthedRequest>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ApiErrorBody = { error: { code: 'INTERNAL', message: ERROR_MESSAGES.INTERNAL, requestId: req.requestId } };
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse() as { code?: ErrorCode; message?: string | string[]; details?: unknown };
      const code: ErrorCode =
        r.code ?? (status === 404 ? 'NOT_FOUND' : status === 401 ? 'AUTH_REQUIRED' : status === 403 ? 'FORBIDDEN' : status === 429 ? 'RATE_LIMITED' : status === 400 ? 'VALIDATION' : 'INTERNAL');
      body = {
        error: {
          code,
          message: r.code && typeof r.message === 'string' ? r.message : ERROR_MESSAGES[code],
          details: r.details,
          requestId: req.requestId,
        },
      };
    } else {
      metrics.errors.inc({ component: 'api', code: 'unhandled' });
      this.logger.error({ err: exception, requestId: req.requestId, path: req.path }, 'erro não tratado');
    }
    res.status(status).json(body);
  }
}

/** ID de requisição + métricas HTTP. */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request & { requestId?: string }, res: Response, next: NextFunction): void {
    const incoming = req.headers['x-request-id'];
    req.requestId = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('x-request-id', req.requestId);
    const end = metrics.httpDuration.startTimer({ method: req.method });
    res.on('finish', () => {
      const route = (req.route as { path?: string } | undefined)?.path ?? 'unmatched';
      end({ route });
      metrics.httpRequests.inc({ method: req.method, route, status: String(res.statusCode) });
    });
    next();
  }
}
