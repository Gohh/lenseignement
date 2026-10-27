import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiError } from '@lenseignement/types';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';

/** Format d'erreur stable (cahier §5.3) : jamais de pile ni de détail interne côté client. */
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const traceId = request.header('x-request-id') ?? randomUUID();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    if (status >= 500) {
      this.logger.error(
        `trace_id=${traceId} ${request.method} ${request.path}`,
        exception as Error,
      );
    }

    const body: ApiError = {
      code: status >= 500 ? 'internal_error' : (HttpStatus[status]?.toLowerCase() ?? 'error'),
      message: status >= 500 ? 'Erreur interne.' : (exception as HttpException).message,
      trace_id: traceId,
    };
    response.status(status).json(body);
  }
}
