import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { RegistrationClosedError, ValidationError } from '../errors.js';

// Express only treats a 4-arg function as error-handling middleware; `next` must stay.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
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

  console.error(err);
  res.status(500).json({ error: 'internal_server_error' });
};
