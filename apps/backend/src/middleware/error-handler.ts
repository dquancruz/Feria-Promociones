import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { ConflictError, RegistrationClosedError, ValidationError } from '../errors.js';

// express.json() (body-parser) rejects with an http-errors object whose `type` says what
// went wrong. The `type` check keeps this from matching unrelated errors that happen to
// carry a `status`.
interface BodyParserError extends Error {
  type: string;
  status: number;
}

function isBodyParserError(err: unknown): err is BodyParserError {
  return (
    err instanceof Error &&
    typeof (err as Partial<BodyParserError>).type === 'string' &&
    typeof (err as Partial<BodyParserError>).status === 'number'
  );
}

// Express only treats a 4-arg function as error-handling middleware; `next` must stay.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // Client mistakes (junk traffic included): answered without a stack trace in the logs.
  if (isBodyParserError(err)) {
    switch (err.type) {
      case 'entity.parse.failed':
        res.status(400).json({ error: 'invalid_json', message: 'El cuerpo de la solicitud no es un JSON válido.' });
        return;
      case 'entity.too.large':
        res.status(413).json({ error: 'payload_too_large', message: 'La solicitud es demasiado grande.' });
        return;
      case 'encoding.unsupported':
      case 'entity.verify.failed':
        res.status(400).json({ error: 'invalid_body', message: 'No se pudo leer el cuerpo de la solicitud.' });
        return;
    }
  }

  if (err instanceof ZodError) {
    res.status(400).json({ error: 'validation_failed', fieldErrors: err.flatten().fieldErrors });
    return;
  }

  if (err instanceof ValidationError) {
    res.status(400).json({ error: 'validation_failed', fieldErrors: err.fieldErrors });
    return;
  }

  if (err instanceof RegistrationClosedError) {
    res.status(403).json({
      error: 'registration_closed',
      message: 'El registro no está disponible por el momento.',
    });
    return;
  }

  if (err instanceof ConflictError) {
    res.status(409).json({
      error: err.code,
      message: 'La cantidad cambió mientras revisabas. Revisa los registros e intenta de nuevo.',
      count: err.actualCount,
    });
    return;
  }

  console.error(err);
  res.status(500).json({ error: 'internal_server_error' });
};
