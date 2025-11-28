/**
 * Property-based and unit tests for PocketBase collection service
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import PocketBase from "pocketbase";
import {
  listCollections,
  getCollection,
  createCollection,
  updateCollection,
  deleteCollection,
  validateCollectionSchema,
  validateCollectionName,
  validateSchemaField,
  isAdminAuthenticated,
  CollectionSchema,
  SchemaField,
} from "./collection-service.js";
import { createClient } from "./client-factory.js";
import { authenticateAdminWithClient } from "./auth-service.js";
import { collectionNameArbitrary, fieldNameArbitrary, fieldTypeArbitrary } from "./test-utils/generators.js";
import { getTestConfig, isPocketBaseAvailable, generateTestId } from "./test-utils/helpers.js";
import { ErrorCode } from "./error-handler.js";

describe("PocketBase Collection Service", () => {
  const testConfig = getTestConfig();
  let pocketBaseAvailable = false;
  let adminClient: PocketBase;
  let userClient: PocketBase;
  const createdCollections: string[] = [];

  beforeAll(async () => {
    pocketBaseAvailable = await isPocketBaseAvailable(testConfig.baseUrl);
    if (!pocketBaseAvailable) {
      console.warn("PocketBase is not available - some tests will be skipped");
      // Create clients anyway for unit tests that don't need PocketBase
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

    // Clean up any test collections created during tests
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
  async function createTestCollection(schema: CollectionSchema): Promise<string> {
    const result = await createCollection(adminClient, schema);
    createdCollections.push(result.collection.name);
    return result.collection.name;
  }

  /**
   * Generate a valid schema field arbitrary
   */
  const validSchemaFieldArbitrary = (): fc.Arbitrary<SchemaField> => {
    return fc.record({
      name: fieldNameArbitrary(),
      type: fc.constantFrom("text", "number", "bool", "email", "url", "date", "json"),
      required: fc.boolean(),
    });
  };

  /**
   * Generate a valid collection schema arbitrary
   */
  const validCollectionSchemaArbitrary = (): fc.Arbitrary<CollectionSchema> => {
    return fc.record({
      name: fc
        .stringMatching(/^test_[a-z][a-z0-9_]{2,20}$/)
        .filter((s) => !s.endsWith("_") && s.length >= 5 && s.length <= 30),
      type: fc.constantFrom("base" as const),
      schema: fc.array(validSchemaFieldArbitrary(), { minLength: 1, maxLength: 5 }).filter((fields) => {
        // Ensure unique field names
        const names = fields.map((f) => f.name);
        return new Set(names).size === names.length;
      }),
    });
  };

  describe("Property 6: Collection creation round-trip", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 6: Collection creation round-trip
     * Validates: Requirements 2.1
     *
     * For any valid collection schema with name and fields, creating the collection
     * and then retrieving it should return equivalent schema information.
     */
    it("should create collection and retrieve equivalent schema", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      await fc.assert(
        fc.asyncProperty(validCollectionSchemaArbitrary(), async (schema) => {
          // Make name unique for this test run
          const uniqueSchema = {
            ...schema,
            name: `${schema.name}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          };

          // Create the collection
          const createResult = await createCollection(adminClient, uniqueSchema);
          createdCollections.push(createResult.collection.name);

          expect(createResult.success).toBe(true);
          expect(createResult.collection.name).toBe(uniqueSchema.name);
          expect(createResult.collection.type).toBe(uniqueSchema.type);

          // Retrieve the collection
          const getResult = await getCollection(adminClient, uniqueSchema.name);

          expect(getResult.success).toBe(true);
          expect(getResult.collection.name).toBe(uniqueSchema.name);
          expect(getResult.collection.type).toBe(uniqueSchema.type);

          // Verify schema fields match (by name and type)
          const createdFieldNames = createResult.collection.schema.map((f) => f.name).sort();
          const retrievedFieldNames = getResult.collection.schema.map((f) => f.name).sort();
          expect(retrievedFieldNames).toEqual(createdFieldNames);

          return true;
        }),
        { numRuns: 5 } // Limit runs to avoid creating too many collections
      );
    });
  });

  describe("Property 7: Collection update persistence", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 7: Collection update persistence
     * Validates: Requirements 2.2
     *
     * For any existing collection and valid schema update, updating the collection
     * and then retrieving it should reflect the updated schema.
     */
    it("should persist collection updates", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      // Create a base collection first
      const baseName = `test_update_${generateTestId()}`;
      const baseSchema: CollectionSchema = {
        name: baseName,
        type: "base",
        schema: [{ name: "title", type: "text", required: false }],
      };

      await createTestCollection(baseSchema);

      // Test updating with different rules
      await fc.assert(
        fc.asyncProperty(
          fc.option(fc.constant(""), { nil: undefined }),
          fc.option(fc.constant(""), { nil: undefined }),
          async (listRule, viewRule) => {
            const updateData: Partial<CollectionSchema> = {};
            if (listRule !== undefined) updateData.listRule = listRule;
            if (viewRule !== undefined) updateData.viewRule = viewRule;

            // Update the collection
            const updateResult = await updateCollection(adminClient, baseName, updateData);
            expect(updateResult.success).toBe(true);

            // Retrieve and verify
            const getResult = await getCollection(adminClient, baseName);
            expect(getResult.success).toBe(true);

            if (listRule !== undefined) {
              expect(getResult.collection.listRule).toBe(listRule);
            }
            if (viewRule !== undefined) {
              expect(getResult.collection.viewRule).toBe(viewRule);
            }

            return true;
          }
        ),
        { numRuns: 5 }
      );
    });
  });

  describe("Property 8: Collection deletion removes collection", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 8: Collection deletion removes collection
     * Validates: Requirements 2.3
     *
     * For any existing collection, after deletion, attempting to retrieve that
     * collection should result in a not-found error.
     */
    it("should remove collection after deletion", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      await fc.assert(
        fc.asyncProperty(validCollectionSchemaArbitrary(), async (schema) => {
          // Make name unique
          const uniqueSchema = {
            ...schema,
            name: `${schema.name}_del_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          };

          // Create the collection
          const createResult = await createCollection(adminClient, uniqueSchema);
          expect(createResult.success).toBe(true);

          // Verify it exists
          const getResult = await getCollection(adminClient, uniqueSchema.name);
          expect(getResult.success).toBe(true);

          // Delete the collection
          const deleteResult = await deleteCollection(adminClient, uniqueSchema.name);
          expect(deleteResult.success).toBe(true);

          // Remove from cleanup list since we deleted it
          const idx = createdCollections.indexOf(uniqueSchema.name);
          if (idx > -1) createdCollections.splice(idx, 1);

          // Verify it no longer exists
          try {
            await getCollection(adminClient, uniqueSchema.name);
            return false; // Should have thrown
          } catch (error: any) {
            expect(error.code).toBe(ErrorCode.NOT_FOUND);
            return true;
          }
        }),
        { numRuns: 3 }
      );
    });
  });

  describe("Property 9: Non-admin collection management rejection", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 9: Non-admin collection management rejection
     * Validates: Requirements 2.4
     *
     * For any collection management operation (create, update, delete) attempted
     * with non-admin credentials, the operation should be rejected with an authorization error.
     */
    it("should reject create from non-admin client", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      await fc.assert(
        fc.asyncProperty(validCollectionSchemaArbitrary(), async (schema) => {
          const uniqueSchema = {
            ...schema,
            name: `${schema.name}_nonadmin_${Date.now()}`,
          };

          try {
            await createCollection(userClient, uniqueSchema);
            return false; // Should have thrown
          } catch (error: any) {
            expect(error.code).toBe(ErrorCode.FORBIDDEN);
            return true;
          }
        }),
        { numRuns: 5 }
      );
    });

    it("should reject update from non-admin client", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      // Create a collection with admin first
      const collectionName = `test_nonadmin_update_${generateTestId()}`;
      await createTestCollection({
        name: collectionName,
        type: "base",
        schema: [{ name: "field1", type: "text", required: false }],
      });

      try {
        await updateCollection(userClient, collectionName, { listRule: "" });
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.FORBIDDEN);
      }
    });

    it("should reject delete from non-admin client", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      // Create a collection with admin first
      const collectionName = `test_nonadmin_delete_${generateTestId()}`;
      await createTestCollection({
        name: collectionName,
        type: "base",
        schema: [{ name: "field1", type: "text", required: false }],
      });

      try {
        await deleteCollection(userClient, collectionName);
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.FORBIDDEN);
      }
    });
  });

  describe("Property 10: Schema validation before creation", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 10: Schema validation before creation
     * Validates: Requirements 2.5
     *
     * For any invalid collection schema (missing required fields, invalid types),
     * the creation or update should be rejected with validation errors before reaching PocketBase.
     */
    it("should reject invalid field types", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      await fc.assert(
        fc.asyncProperty(
          fc
            .string({ minLength: 3, maxLength: 10 })
            .filter(
              (s) =>
                ![
                  "text",
                  "number",
                  "bool",
                  "email",
                  "url",
                  "date",
                  "select",
                  "file",
                  "relation",
                  "json",
                  "editor",
                  "autodate",
                ].includes(s)
            ),
          async (invalidType) => {
            const schema: CollectionSchema = {
              name: `test_invalid_${generateTestId()}`,
              type: "base",
              schema: [{ name: "field1", type: invalidType, required: false }],
            };

            try {
              await createCollection(adminClient, schema);
              return false; // Should have thrown
            } catch (error: any) {
              expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
              expect(error.details?.fields).toBeDefined();
              return true;
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    it("should reject invalid collection names", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      const invalidNames = ["", "a", "ab", "123start", "has space", "has-dash", "_superusers"];

      for (const name of invalidNames) {
        const schema: CollectionSchema = {
          name,
          type: "base",
          schema: [{ name: "field1", type: "text", required: false }],
        };

        try {
          await createCollection(adminClient, schema);
          expect.fail(`Should have rejected name: ${name}`);
        } catch (error: any) {
          expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
        }
      }
    });

    it("should reject duplicate field names", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      const schema: CollectionSchema = {
        name: `test_dup_fields_${generateTestId()}`,
        type: "base",
        schema: [
          { name: "samename", type: "text", required: false },
          { name: "samename", type: "number", required: false },
        ],
      };

      try {
        await createCollection(adminClient, schema);
        expect.fail("Should have rejected duplicate field names");
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      }
    });
  });

  describe("Property 11: Collection list response completeness", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 11: Collection list response completeness
     * Validates: Requirements 3.1
     *
     * For any collection list request, each collection in the response should
     * include name, type, and metadata fields.
     */
    it("should return complete collection list with required fields", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      // Create a test collection to ensure at least one exists
      const testName = `test_list_${generateTestId()}`;
      await createTestCollection({
        name: testName,
        type: "base",
        schema: [{ name: "field1", type: "text", required: false }],
      });

      const result = await listCollections(adminClient);

      expect(result.success).toBe(true);
      expect(Array.isArray(result.collections)).toBe(true);
      expect(result.collections.length).toBeGreaterThan(0);

      // Verify each collection has required fields
      for (const collection of result.collections) {
        expect(collection.id).toBeDefined();
        expect(typeof collection.id).toBe("string");
        expect(collection.name).toBeDefined();
        expect(typeof collection.name).toBe("string");
        expect(collection.type).toBeDefined();
        expect(["base", "auth", "view"].includes(collection.type)).toBe(true);
        expect(collection.created).toBeDefined();
        expect(collection.updated).toBeDefined();
      }
    });
  });

  describe("Property 12: Collection schema response completeness", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 12: Collection schema response completeness
     * Validates: Requirements 3.2
     *
     * For any specific collection retrieval, the response should include complete
     * schema with field definitions, types, and constraints.
     */
    it("should return complete schema with field definitions", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      await fc.assert(
        fc.asyncProperty(validCollectionSchemaArbitrary(), async (schema) => {
          const uniqueSchema = {
            ...schema,
            name: `${schema.name}_schema_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          };

          // Create collection
          await createTestCollection(uniqueSchema);

          // Retrieve and verify schema completeness
          const result = await getCollection(adminClient, uniqueSchema.name);

          expect(result.success).toBe(true);
          expect(result.collection.schema).toBeDefined();
          expect(Array.isArray(result.collection.schema)).toBe(true);

          // Each field should have name, type, and required
          for (const field of result.collection.schema) {
            expect(field.name).toBeDefined();
            expect(typeof field.name).toBe("string");
            expect(field.type).toBeDefined();
            expect(typeof field.type).toBe("string");
            expect(typeof field.required).toBe("boolean");
          }

          return true;
        }),
        { numRuns: 3 }
      );
    });
  });

  describe("Property 13: Collection rules response completeness", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 13: Collection rules response completeness
     * Validates: Requirements 3.3
     *
     * For any collection retrieval, the response should include all access rules:
     * listRule, viewRule, createRule, updateRule, and deleteRule.
     */
    it("should return all access rules in collection response", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      // Create collection with specific rules
      const testName = `test_rules_${generateTestId()}`;
      const schema: CollectionSchema = {
        name: testName,
        type: "base",
        schema: [{ name: "field1", type: "text", required: false }],
        listRule: "",
        viewRule: "",
        createRule: null,
        updateRule: null,
        deleteRule: null,
      };

      await createTestCollection(schema);

      const result = await getCollection(adminClient, testName);

      expect(result.success).toBe(true);
      // All rule fields should be present (even if null)
      expect("listRule" in result.collection).toBe(true);
      expect("viewRule" in result.collection).toBe(true);
      expect("createRule" in result.collection).toBe(true);
      expect("updateRule" in result.collection).toBe(true);
      expect("deleteRule" in result.collection).toBe(true);
    });

    it("should preserve rule values after creation", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      const testName = `test_rules_preserve_${generateTestId()}`;
      const schema: CollectionSchema = {
        name: testName,
        type: "base",
        schema: [{ name: "field1", type: "text", required: false }],
        listRule: "",
        viewRule: "",
        createRule: "",
        updateRule: "",
        deleteRule: "",
      };

      await createTestCollection(schema);

      const result = await getCollection(adminClient, testName);

      expect(result.success).toBe(true);
      expect(result.collection.listRule).toBe("");
      expect(result.collection.viewRule).toBe("");
      expect(result.collection.createRule).toBe("");
      expect(result.collection.updateRule).toBe("");
      expect(result.collection.deleteRule).toBe("");
    });
  });

  describe("Unit Tests - Validation Functions", () => {
    it("should validate collection name correctly", () => {
      // Valid names
      expect(validateCollectionName("users")).toHaveLength(0);
      expect(validateCollectionName("my_collection")).toHaveLength(0);
      expect(validateCollectionName("Collection123")).toHaveLength(0);

      // Invalid names
      expect(validateCollectionName("").length).toBeGreaterThan(0);
      expect(validateCollectionName("ab").length).toBeGreaterThan(0);
      expect(validateCollectionName("123start").length).toBeGreaterThan(0);
      expect(validateCollectionName("has space").length).toBeGreaterThan(0);
      expect(validateCollectionName("_superusers").length).toBeGreaterThan(0);
    });

    it("should validate schema field correctly", () => {
      // Valid field
      const validField: SchemaField = { name: "title", type: "text", required: true };
      expect(validateSchemaField(validField, 0)).toHaveLength(0);

      // Invalid field type
      const invalidType: SchemaField = { name: "title", type: "invalid", required: true };
      expect(validateSchemaField(invalidType, 0).length).toBeGreaterThan(0);

      // Invalid field name
      const invalidName: SchemaField = { name: "123invalid", type: "text", required: true };
      expect(validateSchemaField(invalidName, 0).length).toBeGreaterThan(0);
    });

    it("should validate complete collection schema", () => {
      // Valid schema
      const validSchema: CollectionSchema = {
        name: "test_collection",
        type: "base",
        schema: [{ name: "title", type: "text", required: false }],
      };
      expect(validateCollectionSchema(validSchema)).toHaveLength(0);

      // Invalid schema - bad type
      const invalidTypeSchema: CollectionSchema = {
        name: "test_collection",
        type: "invalid" as any,
        schema: [{ name: "title", type: "text", required: false }],
      };
      expect(validateCollectionSchema(invalidTypeSchema).length).toBeGreaterThan(0);

      // Invalid schema - duplicate fields
      const duplicateFieldsSchema: CollectionSchema = {
        name: "test_collection",
        type: "base",
        schema: [
          { name: "title", type: "text", required: false },
          { name: "title", type: "number", required: false },
        ],
      };
      expect(validateCollectionSchema(duplicateFieldsSchema).length).toBeGreaterThan(0);
    });
  });

  describe("Unit Tests - Admin Authentication Check", () => {
    it("should return false for unauthenticated client", () => {
      const client = createClient({ baseUrl: testConfig.baseUrl });
      expect(isAdminAuthenticated(client)).toBe(false);
    });

    it("should return true for admin authenticated client", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      expect(isAdminAuthenticated(adminClient)).toBe(true);
    });
  });
});
