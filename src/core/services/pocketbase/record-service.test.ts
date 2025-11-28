/**
 * Property-based and unit tests for PocketBase record service
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fc from "fast-check";
import PocketBase from "pocketbase";
import {
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  getAllRecords,
  getFirstRecord,
  QueryOptions,
} from "./record-service.js";
import { createCollection, deleteCollection, CollectionSchema } from "./collection-service.js";
import { createClient } from "./client-factory.js";
import { authenticateAdminWithClient } from "./auth-service.js";
import { getTestConfig, isPocketBaseAvailable, generateTestId } from "./test-utils/helpers.js";
import { ErrorCode } from "./error-handler.js";

describe("PocketBase Record Service", () => {
  const testConfig = getTestConfig();
  let pocketBaseAvailable = false;
  let adminClient: PocketBase;
  let userClient: PocketBase;
  const createdCollections: string[] = [];

  // Test collection schema for record operations
  const testCollectionSchema: CollectionSchema = {
    name: "", // Will be set dynamically
    type: "base",
    schema: [
      { name: "title", type: "text", required: true },
      { name: "description", type: "text", required: false },
      { name: "count", type: "number", required: false },
      { name: "active", type: "bool", required: false },
    ],
    listRule: "", // Allow public list
    viewRule: "", // Allow public view
    createRule: "", // Allow public create
    updateRule: "", // Allow public update
    deleteRule: "", // Allow public delete
  };

  beforeAll(async () => {
    pocketBaseAvailable = await isPocketBaseAvailable(testConfig.baseUrl);
    if (!pocketBaseAvailable) {
      console.warn("PocketBase is not available - some tests will be skipped");
      adminClient = createClient({ baseUrl: testConfig.baseUrl });
      userClient = createClient({ baseUrl: testConfig.baseUrl });
      return;
    }

    // Create and authenticate admin client
    adminClient = createClient({ baseUrl: testConfig.baseUrl });
    try {
      await authenticateAdminWithClient(adminClient, {
        email: testConfig.adminEmail!,
        password: testConfig.adminPassword!,
      });
    } catch (error) {
      console.warn("Admin authentication failed - some tests will be skipped:", error);
      pocketBaseAvailable = false;
    }

    // Create unauthenticated user client
    userClient = createClient({ baseUrl: testConfig.baseUrl });
  });

  afterAll(async () => {
    if (!pocketBaseAvailable) return;

    // Clean up test collections
    for (const collectionName of createdCollections) {
      try {
        await adminClient.collections.delete(collectionName);
      } catch {
        // Ignore errors during cleanup
      }
    }
  });

  /**
   * Helper to create a test collection and track it for cleanup
   */
  async function createTestCollectionWithRecords(
    recordCount: number = 0
  ): Promise<{ collectionName: string; recordIds: string[] }> {
    const collectionName = `test_records_${generateTestId()}`;
    const schema = { ...testCollectionSchema, name: collectionName };

    await createCollection(adminClient, schema);
    createdCollections.push(collectionName);

    const recordIds: string[] = [];
    for (let i = 0; i < recordCount; i++) {
      const result = await createRecord(adminClient, collectionName, {
        title: `Test Record ${i}`,
        description: `Description ${i}`,
        count: i,
        active: i % 2 === 0,
      });
      recordIds.push(result.record.id);
    }

    return { collectionName, recordIds };
  }

  /**
   * Generate valid record data arbitrary
   */
  const validRecordDataArbitrary = (): fc.Arbitrary<{
    title: string;
    description?: string;
    count?: number;
    active?: boolean;
  }> => {
    return fc.record({
      title: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
      description: fc.option(fc.string({ maxLength: 500 }), { nil: undefined }),
      count: fc.option(fc.integer({ min: -1000, max: 1000 }), { nil: undefined }),
      active: fc.option(fc.boolean(), { nil: undefined }),
    });
  };

  describe("Property 15: Record creation round-trip", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 15: Record creation round-trip
     * Validates: Requirements 4.1
     *
     * For any valid record data and collection, creating a record and then
     * retrieving it by id should return equivalent data with an assigned id.
     */
    it("should create record and retrieve equivalent data", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      const { collectionName } = await createTestCollectionWithRecords(0);

      await fc.assert(
        fc.asyncProperty(validRecordDataArbitrary(), async (recordData) => {
          // Create the record
          const createResult = await createRecord(adminClient, collectionName, recordData);

          expect(createResult.success).toBe(true);
          expect(createResult.record.id).toBeDefined();
          expect(createResult.record.title).toBe(recordData.title);

          // Retrieve the record
          const getResult = await getRecord(adminClient, collectionName, createResult.record.id);

          expect(getResult.success).toBe(true);
          expect(getResult.record.id).toBe(createResult.record.id);
          expect(getResult.record.title).toBe(recordData.title);

          // Verify optional fields if provided
          if (recordData.description !== undefined) {
            expect(getResult.record.description).toBe(recordData.description);
          }
          if (recordData.count !== undefined) {
            expect(getResult.record.count).toBe(recordData.count);
          }
          if (recordData.active !== undefined) {
            expect(getResult.record.active).toBe(recordData.active);
          }

          return true;
        }),
        { numRuns: 10 }
      );
    });
  });

  describe("Property 16: Record filtering correctness", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 16: Record filtering correctness
     * Validates: Requirements 4.2
     *
     * For any filter criteria and collection with records, the query should
     * return only records that match the filter criteria.
     */
    it("should return only records matching filter criteria", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      const { collectionName } = await createTestCollectionWithRecords(10);

      // Test filtering by active status
      const activeResult = await listRecords(adminClient, collectionName, {
        filter: "active = true",
      });

      expect(activeResult.success).toBe(true);
      for (const record of activeResult.items) {
        expect(record.active).toBe(true);
      }

      // Test filtering by count range
      const countResult = await listRecords(adminClient, collectionName, {
        filter: "count >= 5",
      });

      expect(countResult.success).toBe(true);
      for (const record of countResult.items) {
        expect(record.count).toBeGreaterThanOrEqual(5);
      }
    });
  });

  describe("Property 17: Record update persistence", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 17: Record update persistence
     * Validates: Requirements 4.3
     *
     * For any existing record and valid update data, updating the record and
     * then retrieving it should reflect the updated data.
     */
    it("should persist record updates", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      const { collectionName, recordIds } = await createTestCollectionWithRecords(1);
      const recordId = recordIds[0];

      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
          fc.integer({ min: 0, max: 1000 }),
          async (newTitle, newCount) => {
            // Update the record
            const updateResult = await updateRecord(adminClient, collectionName, recordId, {
              title: newTitle,
              count: newCount,
            });

            expect(updateResult.success).toBe(true);
            expect(updateResult.record.title).toBe(newTitle);
            expect(updateResult.record.count).toBe(newCount);

            // Retrieve and verify
            const getResult = await getRecord(adminClient, collectionName, recordId);

            expect(getResult.success).toBe(true);
            expect(getResult.record.title).toBe(newTitle);
            expect(getResult.record.count).toBe(newCount);

            return true;
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe("Property 18: Record deletion removes record", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 18: Record deletion removes record
     * Validates: Requirements 4.4
     *
     * For any existing record, after deletion, attempting to retrieve that
     * record should result in a not-found error.
     */
    it("should remove record after deletion", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      const { collectionName } = await createTestCollectionWithRecords(0);

      await fc.assert(
        fc.asyncProperty(validRecordDataArbitrary(), async (recordData) => {
          // Create a record
          const createResult = await createRecord(adminClient, collectionName, recordData);
          expect(createResult.success).toBe(true);

          const recordId = createResult.record.id;

          // Verify it exists
          const getResult = await getRecord(adminClient, collectionName, recordId);
          expect(getResult.success).toBe(true);

          // Delete the record
          const deleteResult = await deleteRecord(adminClient, collectionName, recordId);
          expect(deleteResult.success).toBe(true);

          // Verify it no longer exists
          try {
            await getRecord(adminClient, collectionName, recordId);
            return false; // Should have thrown
          } catch (error: any) {
            expect(error.code).toBe(ErrorCode.NOT_FOUND);
            return true;
          }
        }),
        { numRuns: 5 }
      );
    });
  });

  describe("Property 19: Unauthorized record operation rejection", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 19: Unauthorized record operation rejection
     * Validates: Requirements 4.5
     *
     * For any record operation attempted without proper permissions, the operation
     * should be rejected with an authorization error detailing the required permission.
     */
    it("should reject unauthorized operations on restricted collections", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      // Create a collection with restricted rules (only admin can access)
      const collectionName = `test_restricted_${generateTestId()}`;
      const restrictedSchema: CollectionSchema = {
        name: collectionName,
        type: "base",
        schema: [{ name: "title", type: "text", required: true }],
        listRule: null, // No public access
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
      };

      await createCollection(adminClient, restrictedSchema);
      createdCollections.push(collectionName);

      // Create a record as admin
      const createResult = await createRecord(adminClient, collectionName, { title: "Test" });
      const recordId = createResult.record.id;

      // Try to access with unauthenticated client
      try {
        await listRecords(userClient, collectionName);
        expect.fail("Should have thrown authorization error");
      } catch (error: any) {
        expect([ErrorCode.FORBIDDEN, ErrorCode.AUTH_REQUIRED]).toContain(error.code);
      }

      try {
        await getRecord(userClient, collectionName, recordId);
        expect.fail("Should have thrown authorization error");
      } catch (error: any) {
        expect([ErrorCode.FORBIDDEN, ErrorCode.AUTH_REQUIRED]).toContain(error.code);
      }

      try {
        await createRecord(userClient, collectionName, { title: "Unauthorized" });
        expect.fail("Should have thrown authorization error");
      } catch (error: any) {
        expect([ErrorCode.FORBIDDEN, ErrorCode.AUTH_REQUIRED]).toContain(error.code);
      }
    });
  });

  describe("Property 20: Filter application correctness", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 20: Filter application correctness
     * Validates: Requirements 5.1
     *
     * For any PocketBase filter syntax and dataset, applying the filter should
     * return only records matching the filter expression.
     */
    it("should correctly apply various filter expressions", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      const { collectionName } = await createTestCollectionWithRecords(20);

      // Test equality filter
      const eqResult = await listRecords(adminClient, collectionName, {
        filter: 'title = "Test Record 5"',
      });
      expect(eqResult.success).toBe(true);
      for (const record of eqResult.items) {
        expect(record.title).toBe("Test Record 5");
      }

      // Test comparison filter
      const gtResult = await listRecords(adminClient, collectionName, {
        filter: "count > 10",
      });
      expect(gtResult.success).toBe(true);
      for (const record of gtResult.items) {
        expect(record.count).toBeGreaterThan(10);
      }

      // Test boolean filter
      const boolResult = await listRecords(adminClient, collectionName, {
        filter: "active = false",
      });
      expect(boolResult.success).toBe(true);
      for (const record of boolResult.items) {
        expect(record.active).toBe(false);
      }

      // Test combined filter with AND
      const combinedResult = await listRecords(adminClient, collectionName, {
        filter: "count >= 5 && active = true",
      });
      expect(combinedResult.success).toBe(true);
      for (const record of combinedResult.items) {
        expect(record.count).toBeGreaterThanOrEqual(5);
        expect(record.active).toBe(true);
      }
    });
  });

  describe("Property 21: Sort ordering correctness", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 21: Sort ordering correctness
     * Validates: Requirements 5.2
     *
     * For any sort parameters (field and direction) and dataset, the results
     * should be ordered according to the specified field and direction.
     */
    it("should correctly order results by sort parameters", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      const { collectionName } = await createTestCollectionWithRecords(10);

      // Test ascending sort by count
      const ascResult = await listRecords(adminClient, collectionName, {
        sort: "+count",
      });
      expect(ascResult.success).toBe(true);
      for (let i = 1; i < ascResult.items.length; i++) {
        expect(ascResult.items[i].count).toBeGreaterThanOrEqual(ascResult.items[i - 1].count);
      }

      // Test descending sort by count
      const descResult = await listRecords(adminClient, collectionName, {
        sort: "-count",
      });
      expect(descResult.success).toBe(true);
      for (let i = 1; i < descResult.items.length; i++) {
        expect(descResult.items[i].count).toBeLessThanOrEqual(descResult.items[i - 1].count);
      }

      // Test sort by title
      const titleResult = await listRecords(adminClient, collectionName, {
        sort: "+title",
      });
      expect(titleResult.success).toBe(true);
      for (let i = 1; i < titleResult.items.length; i++) {
        expect(titleResult.items[i].title.localeCompare(titleResult.items[i - 1].title)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("Property 22: Pagination subset correctness", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 22: Pagination subset correctness
     * Validates: Requirements 5.3
     *
     * For any page number and page size, the returned records should be the
     * correct subset with accurate pagination metadata (totalItems, totalPages).
     */
    it("should return correct pagination subsets", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      const totalRecords = 25;
      const { collectionName } = await createTestCollectionWithRecords(totalRecords);

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }), // perPage
          async (perPage) => {
            const expectedTotalPages = Math.ceil(totalRecords / perPage);

            // Get first page
            const page1Result = await listRecords(adminClient, collectionName, {
              page: 1,
              perPage,
              sort: "+count",
            });

            expect(page1Result.success).toBe(true);
            expect(page1Result.page).toBe(1);
            expect(page1Result.perPage).toBe(perPage);
            expect(page1Result.totalItems).toBe(totalRecords);
            expect(page1Result.totalPages).toBe(expectedTotalPages);
            expect(page1Result.items.length).toBe(Math.min(perPage, totalRecords));

            // Get second page if exists
            if (expectedTotalPages > 1) {
              const page2Result = await listRecords(adminClient, collectionName, {
                page: 2,
                perPage,
                sort: "+count",
              });

              expect(page2Result.success).toBe(true);
              expect(page2Result.page).toBe(2);

              // Verify no overlap between pages
              const page1Ids = new Set(page1Result.items.map((r) => r.id));
              for (const record of page2Result.items) {
                expect(page1Ids.has(record.id)).toBe(false);
              }
            }

            return true;
          }
        ),
        { numRuns: 5 }
      );
    });
  });

  describe("Property 24: Combined query operations correctness", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 24: Combined query operations correctness
     * Validates: Requirements 5.5
     *
     * For any combination of filter, sort, and pagination parameters, the operations
     * should be applied in the correct order producing accurate results.
     */
    it("should correctly combine filter, sort, and pagination", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      const { collectionName } = await createTestCollectionWithRecords(30);

      // Combined query: filter active records, sort by count descending, paginate
      const result = await listRecords(adminClient, collectionName, {
        filter: "active = true",
        sort: "-count",
        page: 1,
        perPage: 5,
      });

      expect(result.success).toBe(true);

      // Verify filter is applied
      for (const record of result.items) {
        expect(record.active).toBe(true);
      }

      // Verify sort is applied
      for (let i = 1; i < result.items.length; i++) {
        expect(result.items[i].count).toBeLessThanOrEqual(result.items[i - 1].count);
      }

      // Verify pagination metadata
      expect(result.page).toBe(1);
      expect(result.perPage).toBe(5);
      expect(result.items.length).toBeLessThanOrEqual(5);

      // Get all active records to verify total count
      const allActiveResult = await getAllRecords(adminClient, collectionName, {
        filter: "active = true",
      });
      expect(result.totalItems).toBe(allActiveResult.items.length);
    });

    it("should apply operations in correct order: filter -> sort -> paginate", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      const { collectionName } = await createTestCollectionWithRecords(20);

      // Get filtered and sorted results without pagination
      const allFiltered = await getAllRecords(adminClient, collectionName, {
        filter: "count >= 5",
        sort: "-count",
      });

      // Get first page of same query
      const page1 = await listRecords(adminClient, collectionName, {
        filter: "count >= 5",
        sort: "-count",
        page: 1,
        perPage: 3,
      });

      // First page should match first 3 items of full result
      expect(page1.items.length).toBe(Math.min(3, allFiltered.items.length));
      for (let i = 0; i < page1.items.length; i++) {
        expect(page1.items[i].id).toBe(allFiltered.items[i].id);
      }
    });
  });

  describe("Unit Tests - Record Operations", () => {
    it("should handle empty collection", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      const { collectionName } = await createTestCollectionWithRecords(0);

      const result = await listRecords(adminClient, collectionName);

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(0);
      expect(result.totalItems).toBe(0);
    });

    it("should return not found for non-existent record", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      const { collectionName } = await createTestCollectionWithRecords(0);

      try {
        await getRecord(adminClient, collectionName, "nonexistent123456");
        expect.fail("Should have thrown not found error");
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.NOT_FOUND);
      }
    });

    it("should handle getFirstRecord returning null for no match", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      const { collectionName } = await createTestCollectionWithRecords(5);

      const result = await getFirstRecord(adminClient, collectionName, 'title = "NonExistent"');

      expect(result).toBeNull();
    });

    it("should handle getFirstRecord returning matching record", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      const { collectionName } = await createTestCollectionWithRecords(5);

      const result = await getFirstRecord(adminClient, collectionName, 'title = "Test Record 2"');

      expect(result).not.toBeNull();
      expect(result!.success).toBe(true);
      expect(result!.record.title).toBe("Test Record 2");
    });

    it("should handle getAllRecords without pagination", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      const recordCount = 15;
      const { collectionName } = await createTestCollectionWithRecords(recordCount);

      const result = await getAllRecords(adminClient, collectionName);

      expect(result.success).toBe(true);
      expect(result.items.length).toBe(recordCount);
      expect(result.totalItems).toBe(recordCount);
    });
  });
});
