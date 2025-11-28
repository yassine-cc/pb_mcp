/**
 * File Handling Utilities for PocketBase
 *
 * Provides utilities for working with file fields in PocketBase records:
 * - File URL generation with authentication
 * - File field detection in records
 * - File operation error handling
 *
 * Requirements: 10.1, 10.4, 10.5
 */

import PocketBase, { RecordModel } from "pocketbase";
import { handleError, ErrorCode, ErrorResponse } from "./error-handler.js";

/**
 * Options for generating file URLs
 */
export interface FileUrlOptions {
  /** Include authentication token in URL for protected files */
  withToken?: boolean;
  /** Thumbnail size (e.g., "100x100", "200x200") */
  thumb?: string;
}

/**
 * File URL response
 */
export interface FileUrlResponse {
  success: true;
  url: string;
  filename: string;
  collectionId: string;
  recordId: string;
}

/**
 * Multiple file URLs response
 */
export interface FileUrlsResponse {
  success: true;
  files: Array<{
    url: string;
    filename: string;
    field: string;
  }>;
  collectionId: string;
  recordId: string;
}

/**
 * File field info in a record
 */
export interface FileFieldInfo {
  field: string;
  filenames: string[];
  urls: string[];
}

/**
 * File error types for specific error handling
 */
export enum FileErrorType {
  FILE_NOT_FOUND = "FILE_NOT_FOUND",
  INVALID_FILE_FIELD = "INVALID_FILE_FIELD",
  FILE_ACCESS_DENIED = "FILE_ACCESS_DENIED",
  FILE_OPERATION_FAILED = "FILE_OPERATION_FAILED",
}

/**
 * Generate a file URL for a specific file in a record
 *
 * @param pb - PocketBase client instance
 * @param record - The record containing the file
 * @param filename - The filename to generate URL for
 * @param options - URL generation options
 * @returns Complete file URL
 *
 * Requirements: 10.1, 10.4
 */
export function getFileUrl(
  pb: PocketBase,
  record: RecordModel,
  filename: string,
  options: FileUrlOptions = {}
): FileUrlResponse {
  try {
    if (!record || !record.id || !record.collectionId) {
      throw createFileError(FileErrorType.FILE_OPERATION_FAILED, "Invalid record: missing id or collectionId");
    }

    if (!filename || typeof filename !== "string" || filename.trim() === "") {
      throw createFileError(FileErrorType.FILE_NOT_FOUND, "Filename is required and must be a non-empty string");
    }

    // Build query parameters
    const queryParams: Record<string, string> = {};

    if (options.thumb) {
      queryParams.thumb = options.thumb;
    }

    if (options.withToken && pb.authStore.token) {
      queryParams.token = pb.authStore.token;
    }

    // Use PocketBase SDK's getURL method (getUrl is deprecated)
    const url = pb.files.getURL(record, filename, queryParams);

    return {
      success: true,
      url,
      filename,
      collectionId: record.collectionId,
      recordId: record.id,
    };
  } catch (error: any) {
    if (error.code && Object.values(FileErrorType).includes(error.code)) {
      throw error;
    }
    throw handleFileError(error, `Failed to generate URL for file '${filename}'`);
  }
}

/**
 * Generate file URLs for all files in a specific field of a record
 *
 * @param pb - PocketBase client instance
 * @param record - The record containing the files
 * @param fieldName - The field name containing file(s)
 * @param options - URL generation options
 * @returns Array of file URLs
 *
 * Requirements: 10.1, 10.4
 */
export function getFieldFileUrls(
  pb: PocketBase,
  record: RecordModel,
  fieldName: string,
  options: FileUrlOptions = {}
): FileUrlsResponse {
  try {
    if (!record || !record.id || !record.collectionId) {
      throw createFileError(FileErrorType.FILE_OPERATION_FAILED, "Invalid record: missing id or collectionId");
    }

    const fieldValue = record[fieldName];

    if (fieldValue === undefined || fieldValue === null) {
      throw createFileError(
        FileErrorType.INVALID_FILE_FIELD,
        `Field '${fieldName}' does not exist or is empty in the record`
      );
    }

    // Handle both single file and multiple files
    const filenames: string[] = Array.isArray(fieldValue)
      ? fieldValue
      : [fieldValue].filter((f) => f && typeof f === "string");

    if (filenames.length === 0) {
      return {
        success: true,
        files: [],
        collectionId: record.collectionId,
        recordId: record.id,
      };
    }

    const files = filenames.map((filename) => {
      const urlResponse = getFileUrl(pb, record, filename, options);
      return {
        url: urlResponse.url,
        filename,
        field: fieldName,
      };
    });

    return {
      success: true,
      files,
      collectionId: record.collectionId,
      recordId: record.id,
    };
  } catch (error: any) {
    if (error.code && Object.values(FileErrorType).includes(error.code)) {
      throw error;
    }
    throw handleFileError(error, `Failed to generate URLs for field '${fieldName}'`);
  }
}

/**
 * Detect all file fields in a record based on schema or field values
 *
 * @param record - The record to analyze
 * @param fileFieldNames - Optional list of known file field names
 * @returns Array of file field information
 *
 * Requirements: 10.1
 */
export function detectFileFields(record: RecordModel, fileFieldNames?: string[]): FileFieldInfo[] {
  const fileFields: FileFieldInfo[] = [];

  if (!record) {
    return fileFields;
  }

  // If specific field names are provided, use those
  if (fileFieldNames && fileFieldNames.length > 0) {
    for (const fieldName of fileFieldNames) {
      const fieldValue = record[fieldName];
      if (fieldValue !== undefined && fieldValue !== null) {
        const filenames = Array.isArray(fieldValue)
          ? fieldValue.filter((f) => typeof f === "string")
          : typeof fieldValue === "string"
          ? [fieldValue]
          : [];

        if (filenames.length > 0) {
          fileFields.push({
            field: fieldName,
            filenames,
            urls: [], // URLs need to be generated separately with PocketBase client
          });
        }
      }
    }
    return fileFields;
  }

  // Auto-detect file fields by looking for common patterns
  // File fields typically contain filenames with extensions
  const fileExtensionPattern = /\.[a-zA-Z0-9]{2,5}$/;
  const systemFields = ["id", "collectionId", "collectionName", "created", "updated", "expand"];

  for (const [key, value] of Object.entries(record)) {
    if (systemFields.includes(key) || key.startsWith("_")) {
      continue;
    }

    let filenames: string[] = [];

    if (typeof value === "string" && fileExtensionPattern.test(value)) {
      filenames = [value];
    } else if (Array.isArray(value)) {
      const stringValues = value.filter((v) => typeof v === "string" && fileExtensionPattern.test(v));
      if (stringValues.length > 0) {
        filenames = stringValues;
      }
    }

    if (filenames.length > 0) {
      fileFields.push({
        field: key,
        filenames,
        urls: [],
      });
    }
  }

  return fileFields;
}

/**
 * Get all file URLs from a record
 *
 * @param pb - PocketBase client instance
 * @param record - The record containing files
 * @param fileFieldNames - Optional list of known file field names
 * @param options - URL generation options
 * @returns All file URLs from the record
 *
 * Requirements: 10.1, 10.4
 */
export function getAllFileUrls(
  pb: PocketBase,
  record: RecordModel,
  fileFieldNames?: string[],
  options: FileUrlOptions = {}
): FileUrlsResponse {
  try {
    if (!record || !record.id || !record.collectionId) {
      throw createFileError(FileErrorType.FILE_OPERATION_FAILED, "Invalid record: missing id or collectionId");
    }

    const fileFields = detectFileFields(record, fileFieldNames);
    const allFiles: Array<{ url: string; filename: string; field: string }> = [];

    for (const fileField of fileFields) {
      for (const filename of fileField.filenames) {
        const urlResponse = getFileUrl(pb, record, filename, options);
        allFiles.push({
          url: urlResponse.url,
          filename,
          field: fileField.field,
        });
      }
    }

    return {
      success: true,
      files: allFiles,
      collectionId: record.collectionId,
      recordId: record.id,
    };
  } catch (error: any) {
    if (error.code && Object.values(FileErrorType).includes(error.code)) {
      throw error;
    }
    throw handleFileError(error, "Failed to get all file URLs from record");
  }
}

/**
 * Check if a URL is a valid PocketBase file URL
 *
 * @param url - The URL to validate
 * @param baseUrl - The PocketBase base URL
 * @returns True if the URL is a valid PocketBase file URL
 */
export function isValidFileUrl(url: string, baseUrl: string): boolean {
  if (!url || typeof url !== "string") {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    const parsedBase = new URL(baseUrl);

    // Check if the URL starts with the base URL
    if (parsedUrl.origin !== parsedBase.origin) {
      return false;
    }

    // PocketBase file URLs follow the pattern: /api/files/{collectionId}/{recordId}/{filename}
    const pathPattern = /^\/api\/files\/[a-zA-Z0-9_]+\/[a-zA-Z0-9]+\/.+$/;
    return pathPattern.test(parsedUrl.pathname);
  } catch {
    return false;
  }
}

/**
 * Create a file-specific error
 *
 * @param type - The file error type
 * @param message - Error message
 * @returns ErrorResponse with file-specific details
 *
 * Requirements: 10.5
 */
export function createFileError(type: FileErrorType, message: string): ErrorResponse {
  const suggestions: Record<FileErrorType, string> = {
    [FileErrorType.FILE_NOT_FOUND]: "Verify that the filename exists in the record and is spelled correctly.",
    [FileErrorType.INVALID_FILE_FIELD]: "Check that the field name is correct and contains file data.",
    [FileErrorType.FILE_ACCESS_DENIED]: "Ensure you have proper authentication and permissions to access this file.",
    [FileErrorType.FILE_OPERATION_FAILED]: "Check the record data and try the operation again.",
  };

  return {
    success: false,
    error: message,
    code: type,
    suggestion: suggestions[type],
  };
}

/**
 * Handle file operation errors with specific messaging
 *
 * @param error - The error to handle
 * @param context - Context about the operation
 * @returns ErrorResponse with file-specific details
 *
 * Requirements: 10.5
 */
export function handleFileError(error: unknown, context?: string): ErrorResponse {
  // Check for specific file-related error patterns
  if (error && typeof error === "object") {
    const err = error as any;
    const message = (err.message || "").toLowerCase();

    // File not found
    if (err.status === 404 || message.includes("not found") || message.includes("does not exist")) {
      return createFileError(
        FileErrorType.FILE_NOT_FOUND,
        context ? `${context}: File not found` : "The requested file was not found"
      );
    }

    // Access denied
    if (err.status === 401 || err.status === 403 || message.includes("unauthorized") || message.includes("forbidden")) {
      return createFileError(
        FileErrorType.FILE_ACCESS_DENIED,
        context ? `${context}: Access denied` : "Access to the file was denied"
      );
    }
  }

  // Fall back to general error handling with file context
  const baseError = handleError(error, context);

  // Add file-specific suggestion if not already present
  if (!baseError.suggestion?.includes("file")) {
    baseError.suggestion = `${
      baseError.suggestion || ""
    } If this is a file operation issue, verify the file exists and you have proper permissions.`.trim();
  }

  return baseError;
}
