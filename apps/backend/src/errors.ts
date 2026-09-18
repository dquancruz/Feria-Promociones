export class ValidationError extends Error {
  readonly fieldErrors: Record<string, string>;

  constructor(fieldErrors: Record<string, string>) {
    super('Validation failed');
    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors;
  }
}

export class RegistrationClosedError extends Error {
  constructor() {
    super('Registration is closed');
    this.name = 'RegistrationClosedError';
  }
}
