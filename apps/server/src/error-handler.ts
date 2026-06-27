// apps/server/src/error-handler.ts
// Unified error handling module

export enum ErrorCode {
  AUTH_TOKEN_MISSING = 'AUTH_001',
  AUTH_TOKEN_INVALID = 'AUTH_002',
  AUTH_TOKEN_EXPIRED = 'AUTH_003',
  AUTH_PASSWORD_WRONG = 'AUTH_004',
  AUTH_USER_DISABLED = 'AUTH_005',
  AUTH_USER_NOT_FOUND = 'AUTH_006',
  AUTH_PASSWORD_CHANGED = 'AUTH_007',
  AUTH_RATE_LIMIT = 'AUTH_008',
  INPUT_REQUIRED = 'INPUT_001',
  INPUT_FORMAT = 'INPUT_002',
  INPUT_RANGE = 'INPUT_003',
  INPUT_LENGTH = 'INPUT_004',
  PERM_DENIED = 'PERM_001',
  PERM_STORE_DENIED = 'PERM_002',
  PERM_ROLE_DENIED = 'PERM_003',
  RES_NOT_FOUND = 'RES_001',
  RES_ALREADY_EXISTS = 'RES_002',
  RES_CONFLICT = 'RES_003',
  FILE_TOO_LARGE = 'FILE_001',
  FILE_TYPE_DENIED = 'FILE_002',
  FILE_UPLOAD_FAILED = 'FILE_003',
  SERVER_INTERNAL = 'SRV_001',
  SERVER_DB_ERROR = 'SRV_002',
  SERVER_EXTERNAL = 'SRV_003',
}

export class AppError extends Error {
  public readonly errorCode: string;
  public readonly httpStatus: number;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(errorCode: string, message: string, httpStatus: number = 500, isOperational: boolean = true, details?: any) {
    super(message);
    this.name = 'AppError';
    this.errorCode = errorCode;
    this.httpStatus = httpStatus;
    this.isOperational = isOperational;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toJSON(isProd: boolean = true) {
    return { error: isProd ? this.getPublicMessage() : this.message, code: this.errorCode };
  }

  private getPublicMessage(): string {
    if (this.httpStatus >= 500) return '服务器内部错误';
    return this.message;
  }
}

export function authError(code: ErrorCode, message: string, status: number = 401): AppError {
  return new AppError(code, message, status);
}
export function inputError(code: ErrorCode, message: string): AppError {
  return new AppError(code, message, 400);
}
export function permError(message: string = '无权限'): AppError {
  return new AppError(ErrorCode.PERM_DENIED, message, 403);
}
export function notFoundError(message: string = '资源不存在'): AppError {
  return new AppError(ErrorCode.RES_NOT_FOUND, message, 404);
}
export function dbError(err: Error): AppError {
  console.error('[DB Error]', err.message);
  return new AppError(ErrorCode.SERVER_DB_ERROR, '数据库操作失败', 500, true);
}
