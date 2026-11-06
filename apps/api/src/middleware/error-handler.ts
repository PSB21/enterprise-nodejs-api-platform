import type { ErrorRequestHandler } from 'express';

import { AppError } from '../errors/app-error';

/** Shape of errors raised by Express's own middleware, such as the JSON body parser. */
interface HttpError extends Error {
  status: number;
  expose: boolean;
}

function isClientHttpError(err: unknown): err is HttpError {
  if (!(err instanceof Error) || !('status' in err) || !('expose' in err)) {
    return false;
  }

  return typeof err.status === 'number' && err.status >= 400 && err.status < 500 && !!err.expose;
}

/** Sends every failure in one format. Unexpected errors are logged, never shown to the client. */
export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (isClientHttpError(err)) {
    res.status(err.status).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: err.message },
    });
    return;
  }

  console.error(err);

  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'Something went wrong' },
  });
};
