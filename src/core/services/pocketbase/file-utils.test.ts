/**
 * Property-based and unit tests for PocketBase file utilities
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fc from "fast-check";
import PocketBase, { RecordModel } from "pocketbase";
import {
  getFileUrl,
  getFieldFileUrls,
  detectFileFields,
  getAllFileUrls,
  isValidFileUrl,
  createFileError,
  handleFileError,
  FileErrorType,
  FileUrlOptions,
} from "./file-utils.js";
import { createClient } from "./client-factory.js";
import { getTestConfig, isPocketBaseAvailable, generateTestId } from "./test-utils/helpers.js";

describe("PocketBase File Utilities", () => {
  const testConfig = getTestConfig();
  let pocketBaseAvailable = false;
  let pb: PocketBase;

  beforeAll(async () => {
    pocketBaseAvailable = await isPocketBaseAvailable(testConfig.baseUrl);
    pb = createClient({ baseUrl: testConfig.baseUrl });
  });

  /**
   * Generate valid filenames with extensions
   */
  const filenameArbitrary = (): fc.Arbitrary<string> => {
    return fc
      .tuple(
        fc.stringMatching(/^[a-z0-9_-]{1,20}$/),
        fc.constantFrom("jpg", "png", "pdf", "txt", "doc", "mp4", "mp3", "zip")
      )
      .map(([name, ext]) => `${name}.${ext}`);
  };

  /**
   * Generate mock record data with file fields
   */
  const mockRecordArbitrary = (): fc.Arbitrary<RecordModel> => {
    return fc.record({
      id: fc.stringMatching(/^[a-z0-9]{15}$/),
      collectionId: fc.stringMatching(/^[a-z0-9_]{5,20}$/),
      collectionName: fc.stringMatching(/^[a-z][a-z0-9_]{2,20}$/),
      created: fc.constant(new Date().toISOString()),
      updated: fc.constant(new Date().toISOString()),
    }) as fc.Arbitrary<RecordModel>;
  };

  /**
   * Generate mock record with file field
   */
  const mockRecordWithFileArbitrary = (): fc.Arbitrary<RecordModel & { avatar: string }> => {
    return fc.tuple(mockRecordArbitrary(), filenameArbitrary()).map(([record, filename]) => ({
      ...record,
      avatar: filename,
    })) as fc.Arbitrary<RecordModel & { avatar: string }>;
  };

  /**
   * Generate mock record with multiple file fields
   */
  const mockRecordWithMultipleFilesArbitrary = (): fc.Arbitrary<RecordModel & { images: string[] }> => {
    return fc
      .tuple(mockRecordArbitrary(), fc.array(filenameArbitrary(), { minLength: 1, maxLength: 5 }))
      .map(([record, filenames]) => ({
        ...record,
        images: filenames,
      })) as fc.Arbitrary<RecordModel & { images: string[] }>;
  };

  describe("Property 40: File URL completeness", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 40: File URL completeness
     * Validates: Requirements 10.1, 10.4
     *
     * For any record containing file fields, the returned file URLs should be
     * complete and directly accessible.
     */
    it("should generate complete file URLs containing all required components", async () => {
      await fc.assert(
        fc.asyncProperty(mockRecordWithFileArbitrary(), async (record) => {
          const result = getFileUrl(pb, record, record.avatar);

          // URL should be complete
          expect(result.success).toBe(true);
          expect(result.url).toBeDefined();
          expect(typeof result.url).toBe("string");
          expect(result.url.length).toBeGreaterThan(0);

          // URL should contain required components
          expect(result.url).toContain(record.collectionId);
          expect(result.url).toContain(record.id);
          expect(result.url).toContain(record.avatar);

          // URL should be a valid URL format
          expect(() => new URL(result.url)).not.toThrow();

          // Response should include metadata
          expect(result.filename).toBe(record.avatar);
          expect(result.collectionId).toBe(record.collectionId);
          expect(result.recordId).toBe(record.id);

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it("should include authentication token in URL when requested", async () => {
      // Set a mock token
      pb.authStore.save("test_token_123", null);

      await fc.assert(
        fc.asyncProperty(mockRecordWithFileArbitrary(), async (record) => {
          const result = getFileUrl(pb, record, record.avatar, { withToken: true });

          expect(result.success).toBe(true);
          expect(result.url).toContain("token=");

          return true;
        }),
        { numRuns: 50 }
      );

      // Clear the token
      pb.authStore.clear();
    });

    it("should generate URLs for all files in a multi-file field", async () => {
      await fc.assert(
        fc.asyncProperty(mockRecordWithMultipleFilesArbitrary(), async (record) => {
          const result = getFieldFileUrls(pb, record, "images");

          expect(result.success).toBe(true);
          expect(result.files.length).toBe(record.images.length);

          // Each file should have a complete URL
          for (let i = 0; i < result.files.length; i++) {
            const file = result.files[i];
            expect(file.url).toContain(record.collectionId);
            expect(file.url).toContain(record.id);
            expect(file.url).toContain(record.images[i]);
            expect(file.filename).toBe(record.images[i]);
            expect(file.field).toBe("images");
          }

          return true;
        }),
        { numRuns: 50 }
      );
    });

    it("should detect and generate URLs for all file fields in a record", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            mockRecordArbitrary(),
            filenameArbitrary(),
            fc.array(filenameArbitrary(), { minLength: 1, maxLength: 3 })
          ),
          async ([baseRecord, singleFile, multipleFiles]) => {
            const record = {
              ...baseRecord,
              avatar: singleFile,
              documents: multipleFiles,
            } as RecordModel;

            const result = getAllFileUrls(pb, record, ["avatar", "documents"]);

            expect(result.success).toBe(true);
            expect(result.files.length).toBe(1 + multipleFiles.length);

            // Verify all URLs are complete
            for (const file of result.files) {
              expect(file.url).toContain(record.collectionId);
              expect(file.url).toContain(record.id);
              expect(() => new URL(file.url)).not.toThrow();
            }

            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe("Property 41: File operation error specificity", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 41: File operation error specificity
     * Validates: Requirements 10.5
     *
     * For any file operation failure, the error message should specifically
     * indicate the file handling issue.
     */
    it("should return specific error for missing filename", async () => {
      await fc.assert(
        fc.asyncProperty(
          mockRecordArbitrary(),
          fc.constantFrom("", "   ", null, undefined),
          async (record, invalidFilename) => {
            try {
              getFileUrl(pb, record, invalidFilename as any);
              return false; // Should have thrown
            } catch (error: any) {
              expect(error.success).toBe(false);
              expect(error.code).toBe(FileErrorType.FILE_NOT_FOUND);
              expect(error.error).toContain("Filename");
              expect(error.suggestion).toBeDefined();
              expect(error.suggestion.length).toBeGreaterThan(0);
              return true;
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it("should return specific error for invalid record", async () => {
      await fc.assert(
        fc.asyncProperty(
          filenameArbitrary(),
          fc.constantFrom(null, undefined, {}, { id: "test" }, { collectionId: "test" }),
          async (filename, invalidRecord) => {
            try {
              getFileUrl(pb, invalidRecord as any, filename);
              return false; // Should have thrown
            } catch (error: any) {
              expect(error.success).toBe(false);
              expect(error.code).toBe(FileErrorType.FILE_OPERATION_FAILED);
              expect(error.error).toContain("record");
              expect(error.suggestion).toBeDefined();
              return true;
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it("should return specific error for invalid file field", async () => {
      await fc.assert(
        fc.asyncProperty(
          mockRecordArbitrary(),
          fc.stringMatching(/^[a-z]{5,10}$/),
          async (record, nonExistentField) => {
            try {
              getFieldFileUrls(pb, record, nonExistentField);
              return false; // Should have thrown
            } catch (error: any) {
              expect(error.success).toBe(false);
              expect(error.code).toBe(FileErrorType.INVALID_FILE_FIELD);
              expect(error.error).toContain(nonExistentField);
              expect(error.suggestion).toBeDefined();
              return true;
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it("should create file errors with appropriate suggestions", () => {
      const errorTypes = Object.values(FileErrorType);

      for (const errorType of errorTypes) {
        const error = createFileError(errorType, `Test error for ${errorType}`);

        expect(error.success).toBe(false);
        expect(error.code).toBe(errorType);
        expect(error.error).toContain(errorType);
        expect(error.suggestion).toBeDefined();
        expect(error.suggestion!.length).toBeGreaterThan(0);
      }
    });

    it("should handle various error types with file-specific messaging", () => {
      // Test 404 error
      const notFoundError = handleFileError({ status: 404, message: "Not found" }, "Getting file");
      expect(notFoundError.code).toBe(FileErrorType.FILE_NOT_FOUND);
      expect(notFoundError.error).toContain("not found");

      // Test 401 error
      const authError = handleFileError({ status: 401, message: "Unauthorized" }, "Accessing file");
      expect(authError.code).toBe(FileErrorType.FILE_ACCESS_DENIED);
      expect(authError.error).toContain("denied");

      // Test 403 error
      const forbiddenError = handleFileError({ status: 403, message: "Forbidden" }, "Downloading file");
      expect(forbiddenError.code).toBe(FileErrorType.FILE_ACCESS_DENIED);
      expect(forbiddenError.error).toContain("denied");
    });
  });

  describe("Unit Tests - File Detection", () => {
    it("should detect file fields by extension pattern", () => {
      const record = {
        id: "test123",
        collectionId: "users",
        collectionName: "users",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        name: "John Doe",
        avatar: "profile.jpg",
        resume: "document.pdf",
        tags: ["tag1", "tag2"],
      } as RecordModel;

      const fileFields = detectFileFields(record);

      expect(fileFields.length).toBe(2);
      expect(fileFields.find((f) => f.field === "avatar")).toBeDefined();
      expect(fileFields.find((f) => f.field === "resume")).toBeDefined();
      expect(fileFields.find((f) => f.field === "name")).toBeUndefined();
      expect(fileFields.find((f) => f.field === "tags")).toBeUndefined();
    });

    it("should detect multiple files in array fields", () => {
      const record = {
        id: "test123",
        collectionId: "posts",
        collectionName: "posts",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        title: "My Post",
        images: ["image1.jpg", "image2.png", "image3.gif"],
      } as RecordModel;

      const fileFields = detectFileFields(record);

      expect(fileFields.length).toBe(1);
      expect(fileFields[0].field).toBe("images");
      expect(fileFields[0].filenames).toHaveLength(3);
    });

    it("should use provided field names when specified", () => {
      const record = {
        id: "test123",
        collectionId: "users",
        collectionName: "users",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        avatar: "profile.jpg",
        banner: "banner.png",
      } as RecordModel;

      const fileFields = detectFileFields(record, ["avatar"]);

      expect(fileFields.length).toBe(1);
      expect(fileFields[0].field).toBe("avatar");
    });

    it("should return empty array for null/undefined record", () => {
      expect(detectFileFields(null as any)).toEqual([]);
      expect(detectFileFields(undefined as any)).toEqual([]);
    });
  });

  describe("Unit Tests - URL Validation", () => {
    it("should validate correct PocketBase file URLs", () => {
      const baseUrl = "http://127.0.0.1:8090";
      const validUrl = "http://127.0.0.1:8090/api/files/users/abc123/avatar.jpg";

      expect(isValidFileUrl(validUrl, baseUrl)).toBe(true);
    });

    it("should reject URLs from different origins", () => {
      const baseUrl = "http://127.0.0.1:8090";
      const differentOrigin = "http://example.com/api/files/users/abc123/avatar.jpg";

      expect(isValidFileUrl(differentOrigin, baseUrl)).toBe(false);
    });

    it("should reject URLs with invalid path patterns", () => {
      const baseUrl = "http://127.0.0.1:8090";
      const invalidPath = "http://127.0.0.1:8090/api/records/users/abc123";

      expect(isValidFileUrl(invalidPath, baseUrl)).toBe(false);
    });

    it("should handle invalid URL inputs gracefully", () => {
      const baseUrl = "http://127.0.0.1:8090";

      expect(isValidFileUrl("", baseUrl)).toBe(false);
      expect(isValidFileUrl("not-a-url", baseUrl)).toBe(false);
      expect(isValidFileUrl(null as any, baseUrl)).toBe(false);
      expect(isValidFileUrl(undefined as any, baseUrl)).toBe(false);
    });
  });

  describe("Unit Tests - Thumbnail Support", () => {
    it("should include thumb parameter in URL when specified", async () => {
      const record = {
        id: "test123",
        collectionId: "users",
        collectionName: "users",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        avatar: "profile.jpg",
      } as RecordModel;

      const result = getFileUrl(pb, record, "profile.jpg", { thumb: "100x100" });

      expect(result.success).toBe(true);
      expect(result.url).toContain("thumb=100x100");
    });
  });

  describe("Unit Tests - Empty File Fields", () => {
    it("should return empty files array for empty field value", () => {
      const record = {
        id: "test123",
        collectionId: "posts",
        collectionName: "posts",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        images: [],
      } as RecordModel;

      const result = getFieldFileUrls(pb, record, "images");

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(0);
    });
  });
});
