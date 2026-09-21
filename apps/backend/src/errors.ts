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

// The request was understood but the data is no longer what the caller expected.
export class ConflictError extends Error {
  readonly code: string;
  readonly actualCount: number;

  constructor(code: string, actualCount: number) {
    super(code);
    this.name = 'ConflictError';
    this.code = code;
    this.actualCount = actualCount;
  }
}
