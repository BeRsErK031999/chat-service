export class AppError extends Error {
  public readonly statusCode: number;

  public constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}

export class NotFoundError extends AppError {
  public constructor(message: string) {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  public constructor(message: string) {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends AppError {
  public constructor(message: string) {
    super(message, 400);
    this.name = 'ValidationError';
  }
}
