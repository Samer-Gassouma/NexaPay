
/**
 * Custom error classes for NexaPay SDK
 */

import { ApiError } from './types';

/**
 * Base error class for all NexaPay SDK errors
 */
export class NexaPayError extends Error {
  /**
   * Original error if available
   */
  public readonly originalError?: Error;

  /**
   * Error code for programmatic handling
   */
  public readonly code?: string;

  /**
   * Additional error details
   */
  public readonly details?: Record<string, any>;

  constructor(
    message: string,
    options: {
      code?: string;
      originalError?: Error;
      details?: Record<string, any>;
    } = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code;
    this.originalError = options.originalError;
    this.details = options.details;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when API request fails
 */
export class NexaPayApiError extends NexaPayError {
  /**
   * HTTP status code
   */
  public readonly statusCode: number;

  /**
   * Request ID for debugging
   */
  public readonly requestId?: string;

  /**
   * Rate limit information if applicable
   */
  public readonly rateLimit?: {
    limit: number;
    remaining: number;
    reset: number;
  };

  constructor(
    statusCode: number,
    message: string,
    options: {
      code?: string;
      requestId?: string;
      rateLimit?: {
        limit: number;
        remaining: number;
        reset: number;
      };
      originalError?: Error;
      details?: Record<string, any>;
    } = {}
  ) {
    super(message, options);
    this.statusCode = statusCode;
    this.requestId = options.requestId;
    this.rateLimit = options.rateLimit;
    this.name = 'NexaPayApiError';
  }

  /**
   * Create from API error response
   */
  static fromApiError(apiError: ApiError): NexaPayApiError {
    return new NexaPayApiError(
      apiError.statusCode,
      apiError.message,
      {
        code: apiError.code,
        requestId: apiError.requestId,
        details: apiError.details
      }
    );
  }

  /**
   * Check if error is a rate limit error
   */
  get isRateLimitError(): boolean {
    return this.statusCode === 429;
  }

  /**
   * Check if error is an authentication error
   */
  get isAuthenticationError(): boolean {
    return this.statusCode === 401 || this.statusCode === 403;
  }

  /**
   * Check if error is a validation error
   */
  get isValidationError(): boolean {
    return this.statusCode === 400 || this.statusCode === 422;
  }

  /**
   * Check if error is a server error
   */
  get isServerError(): boolean {
    return this.statusCode >= 500 && this.statusCode < 600;
  }
}

/**
 * Error thrown when authentication fails
 */
export class NexaPayAuthenticationError extends NexaPayApiError {
  constructor(
    message: string = 'Authentication failed',
    options: {
      code?: string;
      requestId?: string;
      originalError?: Error;
      details?: Record<string, any>;
    } = {}
  ) {
    super(401, message, options);
    this.name = 'NexaPayAuthenticationError';
  }
}

/**
 * Error thrown when rate limit is exceeded
 */
export class NexaPayRateLimitError extends NexaPayApiError {
  /**
   * Time to wait before retrying (in seconds)
   */
  public readonly retryAfter?: number;

  constructor(
    message: string = 'Rate limit exceeded',
    options: {
      retryAfter?: number;
      code?: string;
      requestId?: string;
      rateLimit?: {
        limit: number;
        remaining: number;
        reset: number;
      };
      originalError?: Error;
      details?: Record<string, any>;
    } = {}
  ) {
    super(429, message, options);
    this.retryAfter = options.retryAfter;
    this.name = 'NexaPayRateLimitError';
  }
}

/**
 * Error thrown when request validation fails
 */
export class NexaPayValidationError extends NexaPayApiError {
  /**
   * Validation errors by field
   */
  public readonly validationErrors?: Record<string, string[]>;

  constructor(
    message: string = 'Validation failed',
    options: {
      validationErrors?: Record<string, string[]>;
      code?: string;
      requestId?: string;
      originalError?: Error;
      details?: Record<string, any>;
    } = {}
  ) {
    super(400, message, options);
    this.validationErrors = options.validationErrors;
    this.name = 'NexaPayValidationError';
  }
}

/**
 * Error thrown when resource is not found
 */
export class NexaPayNotFoundError extends NexaPayApiError {
  constructor(
    message: string = 'Resource not found',
    options: {
      code?: string;
      requestId?: string;
      originalError?: Error;
      details?: Record<string, any>;
    } = {}
  ) {
    super(404, message, options);
    this.name = 'NexaPayNotFoundError';
  }
}

/**
 * Error thrown when server returns 5xx error
 */
export class NexaPayServerError extends NexaPayApiError {
  constructor(
    message: string = 'Server error occurred',
    options: {
      code?: string;
      requestId?: string;
      originalError?: Error;
      details?: Record<string, any>;
    } = {}
  ) {
    super(500, message, options);
    this.name = 'NexaPayServerError';
  }
}

/**
 * Error thrown when webhook signature verification fails
 */
export class NexaPayWebhookError extends NexaPayError {
  /**
   * Webhook signature that failed verification
   */
  public readonly signature?: string;

  /**
   * Webhook secret used for verification
   */
  public readonly secret?: string;

  constructor(
    message: string = 'Webhook signature verification failed',
    options: {
      signature?: string;
      secret?: string;
      code?: string;
      originalError?: Error;
      details?: Record<string, any>;
    } = {}
  ) {
    super(message, options);
    this.signature = options.signature;
    this.secret = options.secret;
    this.name = 'NexaPayWebhookError';
  }
}

/**
 * Error thrown when network request fails
 */
export class NexaPayNetworkError extends NexaPayError {
  constructor(
    message: string = 'Network request failed',
    options: {
      code?: string;
      originalError?: Error;
      details?: Record<string, any>;
    } = {}
  ) {
    super(message, options);
    this.name = 'NexaPayNetworkError';
  }
}

/**
 * Error thrown when API key is invalid
 */
export class NexaPayInvalidApiKeyError extends NexaPayAuthenticationError {
  constructor(
    message: string = 'Invalid API key',
    options: {
      code?: string;
      requestId?: string;
      originalError?: Error;
      details?: Record<string, any>;
    } = {}
  ) {
    super(message, options);
    this.name = 'NexaPayInvalidApiKeyError';
  }
}

/**
 * Error thrown when configuration is invalid
 */
export class NexaPayConfigurationError extends NexaPayError {
  constructor(
    message: string = 'Invalid configuration',
    options: {
      code?: string;
      originalError?: Error;
      details?: Record<string, any>;
    } = {}
  ) {
    super(message, options);
    this.name = 'NexaPayConfigurationError';
  }
}

/**
 * Check if an error is a NexaPay error
 */
export function isNexaPayError(error: any): error is NexaPayError {
  return error instanceof NexaPayError;
}

/**
 * Check if an error is a NexaPay API error
 */
export function isNexaPayApiError(error: any): error is NexaPayApiError {
  return error instanceof NexaPayApiError;
}

/**
 * Convert any error to NexaPayError
 */
export function toNexaPayError(error: any): NexaPayError {
  if (isNexaPayError(error)) {
    return error;
  }

  if (typeof error === 'object' && error !== null) {
    // Handle Axios errors
    if (error.isAxiosError) {
      const axiosError = error as any;
      if (axiosError.response) {
        const { status, data } = axiosError.response;
        const message = data?.error || data?.message || `HTTP ${status}`;

        if (status === 401 || status === 403) {
          return new NexaPayAuthenticationError(message, {
            requestId: axiosError.response.headers?.['x-request-id'],
            details: data
          });
        } else if (status === 429) {
          const retryAfter = parseInt(axiosError.response.headers?.['retry-after'] || '0');
          return new NexaPayRateLimitError(message, {
            retryAfter,
            requestId: axiosError.response.headers?.['x-request-id'],
            details: data
          });
        } else if (status === 404) {
          return new NexaPayNotFoundError(message, {
            requestId: axiosError.response.headers?.['x-request-id'],
            details: data
          });
        } else if (status === 400 || status === 422) {
          return new NexaPayValidationError(message, {
            requestId: axiosError.response.headers?.['x-request-id'],
            details: data
          });
        } else if (status >= 500) {
          return new NexaPayServerError(message, {
            requestId: axiosError.response.headers?.['x-request-id'],
            details: data
          });
        } else {
          return new NexaPayApiError(status, message, {
            requestId: axiosError.response.headers?.['x-request-id'],
            details: data
          });
        }
      } else if (axiosError.request) {
        return new NexaPayNetworkError('No response received from server', {
          originalError: error
        });
      }
    }

    // Handle generic errors
    if (error.message) {
      return new NexaPayError(error.message, {
        originalError: error,
        details: error.details
      });
    }
  }

  // Handle string errors
  if (typeof error === 'string') {
    return new NexaPayError(error);
  }

  // Fallback
  return new NexaPayError('Unknown error occurred', {
    originalError: error
  });
}
