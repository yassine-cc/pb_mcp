/**
 * Error Handler for PocketBase Operations
 *
 * Transforms PocketBase errors into consistent MCP responses with:
 * - Consistent error response structure
 * - Error type detection (auth, validation, not found, network)
 * - Helpful error messages and suggestions
 *
 * Requirements: 8.1, 8.3, 8.4
 */

/**
 * Standard error response structure for all failed operations
 */
export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: any;
  suggestion?: string;
}

/**
 * Error codes for categorizing errors
 */
export enum ErrorCode {
  AUTH_REQUIRED = "AUTH_REQUIRED",
  AUTH_INVALID = "AUTH_INVALID",
  AUTH_EXPIRED = "AUTH_EXPIRED",
  FORBIDDEN = "FORBIDDEN",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  NOT_FOUND = "NOT_FOUND",
  NETWORK_ERROR = "NETWORK_ERROR",
  SERVER_ERROR = "SERVER_ERROR",
  RATE_LIMITED = "RATE_LIMITED",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

/**
 * Validation error detail for a specific field
 */
export interface FieldValidationError {
  field: string;
  code: string;
  message: string;
}

/**
 * Extended error response for validation errors
 */
export interface ValidationErrorResponse extends ErrorResponse {
  code: ErrorCode.VALIDATION_ERROR;
  details: {
    fields: FieldValidationError[];
  };
}

/**
 * Check if an error is an authentication error (missing or invalid credentials)
 *
 * @param error - The error to check
 * @returns True if the error is authentication-related
 */
export function isAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const err = error as any;

  // Check HTTP status codes
  if (err.status === 401 || err.status === 403) {
    return true;
  }

  // Check error codes
  if (
    err.code === ErrorCode.AUTH_REQUIRED ||
    err.code === ErrorCode.AUTH_INVALID ||
    err.code === ErrorCode.AUTH_EXPIRED ||
    err.code === ErrorCode.FORBIDDEN
  ) {
    return true;
  }

  // Check error message patterns
  const message = (err.message || "").toLowerCase();
  if (
    message.includes("unauthorized") ||
    message.includes("unauthenticated") ||
    message.includes("authentication") ||
    message.includes("not authenticated") ||
    message.includes("invalid credentials") ||
    message.includes("token")
  ) {
    return true;
  }

  return false;
}

/**
 * Check if an error is a validation error
 *
 * @param error - The error to check
 * @returns True if the error is validation-related
 */
export function isValidationError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const err = error as any;

  // Check HTTP status code
  if (err.status === 400) {
    // 400 can be validation or other bad request errors
    // Check if it has field-specific errors
    if (err.data && typeof err.data === "object") {
      return true;
    }
  }

  // Check error code
  if (err.code === ErrorCode.VALIDATION_ERROR) {
    return true;
  }

  // Check for PocketBase validation response structure
  if (err.response?.data && typeof err.response.data === "object") {
    return true;
  }

  return false;
}

/**
 * Check if an error is a not found error
 *
 * @param error - The error to check
 * @returns True if the error indicates a resource was not found
 */
export function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const err = error as any;

  // Check HTTP status code
  if (err.status === 404) {
    return true;
  }

  // Check error code
  if (err.code === ErrorCode.NOT_FOUND) {
    return true;
  }

  // Check error message
  const message = (err.message || "").toLowerCase();
  if (message.includes("not found") || message.includes("doesn't exist") || message.includes("does not exist")) {
    return true;
  }

  return false;
}

/**
 * Check if an error is a network error
 *
 * @param error - The error to check
 * @returns True if the error is network-related
 */
export function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const err = error as any;

  // Check error code
  if (err.code === ErrorCode.NETWORK_ERROR) {
    return true;
  }

  // Check for common network error patterns
  const message = (err.message || "").toLowerCase();
  if (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("econnrefused") ||
    message.includes("connection refused") ||
    message.includes("timeout") ||
    message.includes("dns") ||
    message.includes("unreachable")
  ) {
    return true;
  }

  // Check for TypeError which often indicates network issues
  if (err.name === "TypeError" && message.includes("fetch")) {
    return true;
  }

  return false;
}

/**
 * Check if an error is a rate limiting error
 *
 * @param error - The error to check
 * @returns True if the error indicates rate limiting
 */
export function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const err = error as any;

  // Check HTTP status code
  if (err.status === 429) {
    return true;
  }

  // Check error code
  if (err.code === ErrorCode.RATE_LIMITED) {
    return true;
  }

  // Check error message
  const message = (err.message || "").toLowerCase();
  if (message.includes("rate limit") || message.includes("too many requests")) {
    return true;
  }

  return false;
}

/**
 * Extract validation field errors from a PocketBase error
 *
 * @param error - The error to extract field errors from
 * @returns Array of field validation errors
 */
export function extractValidationErrors(error: unknown): FieldValidationError[] {
  if (!error || typeof error !== "object") {
    return [];
  }

  const err = error as any;
  const fieldErrors: FieldValidationError[] = [];

  // PocketBase returns validation errors in data object
  const data = err.data || err.response?.data || {};

  if (typeof data === "object" && data !== null) {
    for (const [field, fieldError] of Object.entries(data)) {
      if (typeof fieldError === "object" && fieldError !== null) {
        const fe = fieldError as any;
        fieldErrors.push({
          field,
          code: fe.code || "validation_failed",
          message: fe.message || `Validation failed for field: ${field}`,
        });
      } else if (typeof fieldError === "string") {
        fieldErrors.push({
          field,
          code: "validation_failed",
          message: fieldError,
        });
      }
    }
  }

  return fieldErrors;
}

/**
 * Get a helpful suggestion based on the error type
 *
 * @param error - The error to get a suggestion for
 * @returns A helpful suggestion string
 */
export function getSuggestion(error: unknown): string {
  if (isNetworkError(error)) {
    return "Check that PocketBase is running and accessible at the configured URL.";
  }

  if (isAuthError(error)) {
    const err = error as any;
    if (err.status === 401 || err.code === ErrorCode.AUTH_REQUIRED) {
      return "Authentication is required. Please authenticate using authenticate_admin or authenticate_user first.";
    }
    if (err.status === 403 || err.code === ErrorCode.FORBIDDEN) {
      return "You do not have permission for this operation. Check that you have the required role or permissions.";
    }
    return "Check your credentials and try authenticating again.";
  }

  if (isValidationError(error)) {
    return "Check the field values and ensure they meet the schema requirements.";
  }

  if (isNotFoundError(error)) {
    return "Verify that the resource exists and the ID or name is correct.";
  }

  if (isRateLimitError(error)) {
    return "Too many requests. Please wait before trying again.";
  }

  return "If the problem persists, check the PocketBase logs for more details.";
}

/**
 * Determine the error code based on the error type
 *
 * @param error - The error to categorize
 * @returns The appropriate error code
 */
export function getErrorCode(error: unknown): ErrorCode {
  if (isNetworkError(error)) {
    return ErrorCode.NETWORK_ERROR;
  }

  if (isRateLimitError(error)) {
    return ErrorCode.RATE_LIMITED;
  }

  if (isNotFoundError(error)) {
    return ErrorCode.NOT_FOUND;
  }

  if (isValidationError(error)) {
    return ErrorCode.VALIDATION_ERROR;
  }

  if (isAuthError(error)) {
    const err = error as any;
    if (err.status === 403 || err.code === ErrorCode.FORBIDDEN) {
      return ErrorCode.FORBIDDEN;
    }
    if (err.code === ErrorCode.AUTH_EXPIRED) {
      return ErrorCode.AUTH_EXPIRED;
    }
    // Check if it's missing auth vs invalid auth
    const message = (err.message || "").toLowerCase();
    if (message.includes("not authenticated") || message.includes("authentication required")) {
      return ErrorCode.AUTH_REQUIRED;
    }
    return ErrorCode.AUTH_INVALID;
  }

  const err = error as any;
  if (err?.status >= 500) {
    return ErrorCode.SERVER_ERROR;
  }

  return ErrorCode.UNKNOWN_ERROR;
}

/**
 * Get a human-readable error message
 *
 * @param error - The error to get a message for
 * @param defaultMessage - Default message if none can be extracted
 * @returns A human-readable error message
 */
export function getErrorMessage(error: unknown, defaultMessage: string = "An unexpected error occurred"): string {
  if (!error) {
    return defaultMessage;
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object") {
    const err = error as any;

    // Use existing message if available
    if (err.message && typeof err.message === "string") {
      return err.message;
    }

    // Check for PocketBase response message
    if (err.response?.message) {
      return err.response.message;
    }

    // Generate message based on error type
    const code = getErrorCode(error);
    switch (code) {
      case ErrorCode.AUTH_REQUIRED:
        return "Authentication is required for this operation";
      case ErrorCode.AUTH_INVALID:
        return "Invalid credentials provided";
      case ErrorCode.AUTH_EXPIRED:
        return "Authentication token has expired";
      case ErrorCode.FORBIDDEN:
        return "You do not have permission to perform this operation";
      case ErrorCode.VALIDATION_ERROR:
        return "Validation failed for the provided data";
      case ErrorCode.NOT_FOUND:
        return "The requested resource was not found";
      case ErrorCode.NETWORK_ERROR:
        return "Unable to connect to PocketBase server";
      case ErrorCode.SERVER_ERROR:
        return "PocketBase server encountered an error";
      case ErrorCode.RATE_LIMITED:
        return "Too many requests - please try again later";
      default:
        return defaultMessage;
    }
  }

  return defaultMessage;
}

/**
 * Transform any error into a consistent ErrorResponse structure
 *
 * This is the main entry point for error handling. It takes any error
 * and transforms it into a standardized response format.
 *
 * @param error - The error to transform
 * @param context - Optional context about the operation that failed
 * @returns A consistent ErrorResponse object
 *
 * Requirements: 8.1, 8.3, 8.4
 */
export function handleError(error: unknown, context?: string): ErrorResponse {
  const code = getErrorCode(error);
  const message = context ? `${context}: ${getErrorMessage(error)}` : getErrorMessage(error);
  const suggestion = getSuggestion(error);

  // Build the base response
  const response: ErrorResponse = {
    success: false,
    error: message,
    code,
    suggestion,
  };

  // Add validation details if applicable
  if (code === ErrorCode.VALIDATION_ERROR) {
    const fieldErrors = extractValidationErrors(error);
    if (fieldErrors.length > 0) {
      response.details = { fields: fieldErrors };
    }
  }

  // Add any additional details from the original error
  const err = error as any;
  if (err?.data && code !== ErrorCode.VALIDATION_ERROR) {
    response.details = err.data;
  } else if (err?.response?.data && code !== ErrorCode.VALIDATION_ERROR) {
    response.details = err.response.data;
  }

  return response;
}

/**
 * Create an error response for unauthenticated requests
 *
 * @param operation - The operation that requires authentication
 * @returns An ErrorResponse indicating authentication is required
 *
 * Requirements: 8.4
 */
export function createAuthRequiredError(operation?: string): ErrorResponse {
  const message = operation
    ? `Authentication is required for ${operation}`
    : "Authentication is required for this operation";

  return {
    success: false,
    error: message,
    code: ErrorCode.AUTH_REQUIRED,
    suggestion: "Please authenticate using authenticate_admin or authenticate_user first.",
  };
}

/**
 * Create an error response for validation failures
 *
 * @param fieldErrors - Array of field-specific validation errors
 * @param message - Optional custom message
 * @returns A ValidationErrorResponse with field details
 *
 * Requirements: 8.3
 */
export function createValidationError(fieldErrors: FieldValidationError[], message?: string): ValidationErrorResponse {
  return {
    success: false,
    error: message || "Validation failed for the provided data",
    code: ErrorCode.VALIDATION_ERROR,
    details: { fields: fieldErrors },
    suggestion: "Check the field values and ensure they meet the schema requirements.",
  };
}

/**
 * Create an error response for not found resources
 *
 * @param resourceType - The type of resource (e.g., "collection", "record")
 * @param identifier - The identifier that was not found
 * @returns An ErrorResponse indicating the resource was not found
 */
export function createNotFoundError(resourceType: string, identifier: string): ErrorResponse {
  return {
    success: false,
    error: `${resourceType} '${identifier}' was not found`,
    code: ErrorCode.NOT_FOUND,
    suggestion: `Verify that the ${resourceType.toLowerCase()} exists and the ID or name is correct.`,
  };
}

/**
 * Create an error response for network/connection issues
 *
 * @param url - The URL that could not be reached
 * @returns An ErrorResponse indicating a network error
 */
export function createNetworkError(url?: string): ErrorResponse {
  const message = url ? `Unable to connect to PocketBase at ${url}` : "Unable to connect to PocketBase server";

  return {
    success: false,
    error: message,
    code: ErrorCode.NETWORK_ERROR,
    suggestion: "Check that PocketBase is running and accessible at the configured URL.",
  };
}
