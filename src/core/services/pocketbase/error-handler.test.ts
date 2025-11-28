/**
 * Property-based and unit tests for PocketBase error handler
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  handleError,
  isAuthError,
  isValidationError,
  isNotFoundError,
  isNetworkError,
  isRateLimitError,
  extractValidationErrors,
  getErrorCode,
  getErrorMessage,
  getSuggestion,
  createAuthRequiredError,
  createValidationError,
  createNotFoundError,
  createNetworkError,
  ErrorCode,
  ErrorResponse,
  FieldValidationError,
} from "./error-handler.js";

/**
 * Generators for error-related test data
 */

// Generate random error messages
const errorMessageArbitrary = (): fc.Arbitrary<string> => {
  return fc.string({ minLength: 1, maxLength: 200 });
};

// Generate HTTP status codes
const httpStatusArbitrary = (): fc.Arbitrary<number> => {
  return fc.integer({ min: 100, max: 599 });
};

// Generate auth-related status codes
const authStatusArbitrary = (): fc.Arbitrary<number> => {
  return fc.constantFrom(401, 403);
};

// Generate validation status code
const validationStatusArbitrary = (): fc.Arbitrary<number> => {
  return fc.constant(400);
};

// Generate not found status code
const notFoundStatusArbitrary = (): fc.Arbitrary<number> => {
  return fc.constant(404);
};

// Generate field names for validation errors
const fieldNameArbitrary = (): fc.Arbitrary<string> => {
  return fc.stringMatching(/^[a-z][a-z0-9_]{1,20}$/);
};

// Generate validation error codes
const validationCodeArbitrary = (): fc.Arbitrary<string> => {
  return fc.constantFrom(
    "validation_required",
    "validation_invalid_email",
    "validation_min_length",
    "validation_max_length",
    "validation_unique"
  );
};

// Generate field validation errors
const fieldValidationErrorArbitrary = (): fc.Arbitrary<FieldValidationError> => {
  return fc.record({
    field: fieldNameArbitrary(),
    code: validationCodeArbitrary(),
    message: errorMessageArbitrary(),
  });
};

// Generate PocketBase-like error objects
const pocketBaseErrorArbitrary = (): fc.Arbitrary<{
  status: number;
  message: string;
  data?: Record<string, any>;
}> => {
  return fc.record({
    status: httpStatusArbitrary(),
    message: errorMessageArbitrary(),
    data: fc.option(fc.dictionary(fc.string(), fc.anything()), { nil: undefined }),
  });
};

// Generate auth error objects
const authErrorArbitrary = (): fc.Arbitrary<{
  status: number;
  message: string;
  code?: string;
}> => {
  return fc.record({
    status: authStatusArbitrary(),
    message: fc.constantFrom("Unauthorized", "Invalid credentials", "Authentication required", "Not authenticated"),
    code: fc.option(fc.constantFrom(ErrorCode.AUTH_REQUIRED, ErrorCode.AUTH_INVALID, ErrorCode.FORBIDDEN), {
      nil: undefined,
    }),
  });
};

// Generate validation error objects with field details
const validationErrorArbitrary = (): fc.Arbitrary<{
  status: number;
  message: string;
  data: Record<string, { code: string; message: string }>;
}> => {
  return fc.record({
    status: validationStatusArbitrary(),
    message: fc.constant("Validation failed"),
    data: fc.dictionary(
      fieldNameArbitrary(),
      fc.record({
        code: validationCodeArbitrary(),
        message: errorMessageArbitrary(),
      }),
      { minKeys: 1, maxKeys: 5 }
    ),
  });
};

// Generate network error objects
const networkErrorArbitrary = (): fc.Arbitrary<{
  message: string;
  name?: string;
}> => {
  return fc.record({
    message: fc.constantFrom(
      "fetch failed",
      "Network error",
      "ECONNREFUSED",
      "Connection refused",
      "Timeout",
      "DNS lookup failed"
    ),
    name: fc.option(fc.constantFrom("TypeError", "Error"), { nil: undefined }),
  });
};

describe("PocketBase Error Handler", () => {
  describe("Property 34: Error response structure consistency", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 34: Error response structure consistency
     * Validates: Requirements 8.1
     *
     * For any operation that fails, the error response should have a consistent structure
     * including success: false, error message, and relevant details.
     */
    it("should always return consistent error structure for any error input", () => {
      fc.assert(
        fc.property(pocketBaseErrorArbitrary(), (error) => {
          const response = handleError(error);

          // Verify required fields exist
          expect(response).toHaveProperty("success");
          expect(response).toHaveProperty("error");

          // Verify success is always false
          expect(response.success).toBe(false);

          // Verify error is a non-empty string
          expect(typeof response.error).toBe("string");
          expect(response.error.length).toBeGreaterThan(0);

          // Verify code is a valid ErrorCode if present
          if (response.code !== undefined) {
            expect(Object.values(ErrorCode)).toContain(response.code);
          }

          // Verify suggestion is a string if present
          if (response.suggestion !== undefined) {
            expect(typeof response.suggestion).toBe("string");
          }
        }),
        { numRuns: 100 }
      );
    });

    it("should return consistent structure for null/undefined errors", () => {
      const nullResponse = handleError(null);
      const undefinedResponse = handleError(undefined);

      // Both should have the required structure
      expect(nullResponse.success).toBe(false);
      expect(typeof nullResponse.error).toBe("string");

      expect(undefinedResponse.success).toBe(false);
      expect(typeof undefinedResponse.error).toBe("string");
    });

    it("should return consistent structure for string errors", () => {
      fc.assert(
        fc.property(errorMessageArbitrary(), (errorMessage) => {
          const response = handleError(errorMessage);

          expect(response.success).toBe(false);
          expect(typeof response.error).toBe("string");
          expect(response.error.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it("should return consistent structure for Error objects", () => {
      fc.assert(
        fc.property(errorMessageArbitrary(), (message) => {
          const error = new Error(message);
          const response = handleError(error);

          expect(response.success).toBe(false);
          expect(typeof response.error).toBe("string");
          expect(response.error).toContain(message);
        }),
        { numRuns: 100 }
      );
    });

    it("should include context in error message when provided", () => {
      fc.assert(
        fc.property(pocketBaseErrorArbitrary(), fc.string({ minLength: 1, maxLength: 50 }), (error, context) => {
          const response = handleError(error, context);

          expect(response.success).toBe(false);
          expect(response.error).toContain(context);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 35: Validation error detail completeness", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 35: Validation error detail completeness
     * Validates: Requirements 8.3
     *
     * For any validation failure, the error response should include specific errors
     * for each invalid field.
     */
    it("should extract all field errors from validation error", () => {
      fc.assert(
        fc.property(validationErrorArbitrary(), (error) => {
          const response = handleError(error);

          // Should be identified as validation error
          expect(response.code).toBe(ErrorCode.VALIDATION_ERROR);

          // Should have details with fields
          expect(response.details).toBeDefined();
          expect(response.details.fields).toBeDefined();
          expect(Array.isArray(response.details.fields)).toBe(true);

          // Each field in the original error should be in the response
          const fieldNames = Object.keys(error.data);
          const responseFieldNames = response.details.fields.map((f: FieldValidationError) => f.field);

          for (const fieldName of fieldNames) {
            expect(responseFieldNames).toContain(fieldName);
          }
        }),
        { numRuns: 100 }
      );
    });

    it("should include field, code, and message for each validation error", () => {
      fc.assert(
        fc.property(validationErrorArbitrary(), (error) => {
          const fieldErrors = extractValidationErrors(error);

          for (const fieldError of fieldErrors) {
            // Each field error should have required properties
            expect(fieldError).toHaveProperty("field");
            expect(fieldError).toHaveProperty("code");
            expect(fieldError).toHaveProperty("message");

            // All should be non-empty strings
            expect(typeof fieldError.field).toBe("string");
            expect(fieldError.field.length).toBeGreaterThan(0);

            expect(typeof fieldError.code).toBe("string");
            expect(fieldError.code.length).toBeGreaterThan(0);

            expect(typeof fieldError.message).toBe("string");
            expect(fieldError.message.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 100 }
      );
    });

    it("should create validation error with all provided field errors", () => {
      fc.assert(
        fc.property(fc.array(fieldValidationErrorArbitrary(), { minLength: 1, maxLength: 10 }), (fieldErrors) => {
          const response = createValidationError(fieldErrors);

          expect(response.success).toBe(false);
          expect(response.code).toBe(ErrorCode.VALIDATION_ERROR);
          expect(response.details.fields).toHaveLength(fieldErrors.length);

          // All provided field errors should be in the response
          for (let i = 0; i < fieldErrors.length; i++) {
            expect(response.details.fields[i].field).toBe(fieldErrors[i].field);
            expect(response.details.fields[i].code).toBe(fieldErrors[i].code);
            expect(response.details.fields[i].message).toBe(fieldErrors[i].message);
          }
        }),
        { numRuns: 100 }
      );
    });

    it("should handle validation errors with string field values", () => {
      const error = {
        status: 400,
        data: {
          email: "Invalid email format",
          password: "Password too short",
        },
      };

      const fieldErrors = extractValidationErrors(error);

      expect(fieldErrors).toHaveLength(2);
      expect(fieldErrors.find((f) => f.field === "email")).toBeDefined();
      expect(fieldErrors.find((f) => f.field === "password")).toBeDefined();
    });
  });

  describe("Property 36: Unauthenticated request error clarity", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 36: Unauthenticated request error clarity
     * Validates: Requirements 8.4
     *
     * For any operation requiring authentication attempted without credentials,
     * the error should clearly indicate authentication is needed.
     */
    it("should identify auth errors and provide clear authentication message", () => {
      fc.assert(
        fc.property(authErrorArbitrary(), (error) => {
          const response = handleError(error);

          // Should be identified as auth error
          expect(isAuthError(error)).toBe(true);

          // Code should be auth-related
          expect([
            ErrorCode.AUTH_REQUIRED,
            ErrorCode.AUTH_INVALID,
            ErrorCode.AUTH_EXPIRED,
            ErrorCode.FORBIDDEN,
          ]).toContain(response.code);

          // Should have a suggestion about authentication
          expect(response.suggestion).toBeDefined();
          expect(typeof response.suggestion).toBe("string");
          expect(response.suggestion!.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it("should create auth required error with clear message", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 50 }), (operation) => {
          const response = createAuthRequiredError(operation);

          expect(response.success).toBe(false);
          expect(response.code).toBe(ErrorCode.AUTH_REQUIRED);
          expect(response.error).toContain(operation);
          expect(response.error.toLowerCase()).toContain("authentication");
          expect(response.suggestion).toBeDefined();
          expect(response.suggestion!.toLowerCase()).toContain("authenticate");
        }),
        { numRuns: 100 }
      );
    });

    it("should create auth required error without operation context", () => {
      const response = createAuthRequiredError();

      expect(response.success).toBe(false);
      expect(response.code).toBe(ErrorCode.AUTH_REQUIRED);
      expect(response.error.toLowerCase()).toContain("authentication");
      expect(response.suggestion).toBeDefined();
    });

    it("should detect 401 status as auth error", () => {
      fc.assert(
        fc.property(errorMessageArbitrary(), (message) => {
          const error = { status: 401, message };
          expect(isAuthError(error)).toBe(true);

          const response = handleError(error);
          expect([ErrorCode.AUTH_REQUIRED, ErrorCode.AUTH_INVALID]).toContain(response.code);
        }),
        { numRuns: 100 }
      );
    });

    it("should detect 403 status as auth error", () => {
      fc.assert(
        fc.property(errorMessageArbitrary(), (message) => {
          const error = { status: 403, message };
          expect(isAuthError(error)).toBe(true);

          const response = handleError(error);
          expect(response.code).toBe(ErrorCode.FORBIDDEN);
        }),
        { numRuns: 100 }
      );
    });

    it("should provide authentication suggestion for unauthenticated errors", () => {
      const unauthErrors = [
        { status: 401, message: "Unauthorized" },
        { status: 401, message: "Not authenticated" },
        { message: "Authentication required" },
        { code: ErrorCode.AUTH_REQUIRED, message: "Auth needed" },
      ];

      for (const error of unauthErrors) {
        const suggestion = getSuggestion(error);
        expect(suggestion.toLowerCase()).toMatch(/authenticat/);
      }
    });
  });

  describe("Unit Tests - Error Type Detection", () => {
    it("should correctly identify auth errors", () => {
      expect(isAuthError({ status: 401 })).toBe(true);
      expect(isAuthError({ status: 403 })).toBe(true);
      expect(isAuthError({ code: ErrorCode.AUTH_REQUIRED })).toBe(true);
      expect(isAuthError({ code: ErrorCode.AUTH_INVALID })).toBe(true);
      expect(isAuthError({ message: "unauthorized" })).toBe(true);
      expect(isAuthError({ message: "invalid credentials" })).toBe(true);
      expect(isAuthError({ status: 200 })).toBe(false);
      expect(isAuthError(null)).toBe(false);
      expect(isAuthError(undefined)).toBe(false);
    });

    it("should correctly identify validation errors", () => {
      expect(isValidationError({ status: 400, data: { field: "error" } })).toBe(true);
      expect(isValidationError({ code: ErrorCode.VALIDATION_ERROR })).toBe(true);
      expect(isValidationError({ status: 400 })).toBe(false);
      expect(isValidationError({ status: 200 })).toBe(false);
      expect(isValidationError(null)).toBe(false);
    });

    it("should correctly identify not found errors", () => {
      expect(isNotFoundError({ status: 404 })).toBe(true);
      expect(isNotFoundError({ code: ErrorCode.NOT_FOUND })).toBe(true);
      expect(isNotFoundError({ message: "not found" })).toBe(true);
      expect(isNotFoundError({ message: "doesn't exist" })).toBe(true);
      expect(isNotFoundError({ status: 200 })).toBe(false);
      expect(isNotFoundError(null)).toBe(false);
    });

    it("should correctly identify network errors", () => {
      expect(isNetworkError({ message: "fetch failed" })).toBe(true);
      expect(isNetworkError({ message: "ECONNREFUSED" })).toBe(true);
      expect(isNetworkError({ message: "connection refused" })).toBe(true);
      expect(isNetworkError({ message: "timeout" })).toBe(true);
      expect(isNetworkError({ code: ErrorCode.NETWORK_ERROR })).toBe(true);
      expect(isNetworkError({ name: "TypeError", message: "fetch" })).toBe(true);
      expect(isNetworkError({ status: 200 })).toBe(false);
      expect(isNetworkError(null)).toBe(false);
    });

    it("should correctly identify rate limit errors", () => {
      expect(isRateLimitError({ status: 429 })).toBe(true);
      expect(isRateLimitError({ code: ErrorCode.RATE_LIMITED })).toBe(true);
      expect(isRateLimitError({ message: "rate limit exceeded" })).toBe(true);
      expect(isRateLimitError({ message: "too many requests" })).toBe(true);
      expect(isRateLimitError({ status: 200 })).toBe(false);
      expect(isRateLimitError(null)).toBe(false);
    });
  });

  describe("Unit Tests - Error Code Detection", () => {
    it("should return correct error codes", () => {
      expect(getErrorCode({ message: "network error" })).toBe(ErrorCode.NETWORK_ERROR);
      expect(getErrorCode({ status: 429 })).toBe(ErrorCode.RATE_LIMITED);
      expect(getErrorCode({ status: 404 })).toBe(ErrorCode.NOT_FOUND);
      expect(getErrorCode({ status: 400, data: { field: "error" } })).toBe(ErrorCode.VALIDATION_ERROR);
      expect(getErrorCode({ status: 401 })).toBe(ErrorCode.AUTH_INVALID);
      expect(getErrorCode({ status: 403 })).toBe(ErrorCode.FORBIDDEN);
      expect(getErrorCode({ status: 500 })).toBe(ErrorCode.SERVER_ERROR);
      expect(getErrorCode({})).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });

  describe("Unit Tests - Error Message Extraction", () => {
    it("should extract message from various error formats", () => {
      expect(getErrorMessage({ message: "Test error" })).toBe("Test error");
      expect(getErrorMessage({ response: { message: "Response error" } })).toBe("Response error");
      expect(getErrorMessage("String error")).toBe("String error");
      expect(getErrorMessage(null, "Default")).toBe("Default");
      expect(getErrorMessage(undefined, "Default")).toBe("Default");
    });

    it("should generate appropriate messages for error types", () => {
      expect(getErrorMessage({ status: 401 })).toContain("credentials");
      expect(getErrorMessage({ status: 403 })).toContain("permission");
      expect(getErrorMessage({ status: 404 })).toContain("not found");
      // When a message exists, it's preserved; when no message, it generates based on type
      expect(getErrorMessage({ code: ErrorCode.NETWORK_ERROR })).toContain("connect");
    });
  });

  describe("Unit Tests - Helper Functions", () => {
    it("should create not found error with resource info", () => {
      const response = createNotFoundError("Collection", "users");

      expect(response.success).toBe(false);
      expect(response.code).toBe(ErrorCode.NOT_FOUND);
      expect(response.error).toContain("Collection");
      expect(response.error).toContain("users");
      expect(response.suggestion).toBeDefined();
    });

    it("should create network error with URL info", () => {
      const response = createNetworkError("http://localhost:8090");

      expect(response.success).toBe(false);
      expect(response.code).toBe(ErrorCode.NETWORK_ERROR);
      expect(response.error).toContain("http://localhost:8090");
      expect(response.suggestion).toBeDefined();
    });

    it("should create network error without URL", () => {
      const response = createNetworkError();

      expect(response.success).toBe(false);
      expect(response.code).toBe(ErrorCode.NETWORK_ERROR);
      expect(response.error).toContain("PocketBase");
      expect(response.suggestion).toBeDefined();
    });
  });

  describe("Unit Tests - Suggestion Generation", () => {
    it("should provide appropriate suggestions for each error type", () => {
      expect(getSuggestion({ message: "network error" })).toContain("PocketBase");
      expect(getSuggestion({ status: 401 })).toContain("authenticat");
      expect(getSuggestion({ status: 403 })).toContain("permission");
      expect(getSuggestion({ status: 400, data: {} })).toContain("field");
      expect(getSuggestion({ status: 404 })).toContain("resource");
      expect(getSuggestion({ status: 429 })).toContain("wait");
    });
  });
});
