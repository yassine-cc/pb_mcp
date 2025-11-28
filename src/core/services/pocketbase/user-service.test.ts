/**
 * Property-based and unit tests for PocketBase user service
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fc from "fast-check";
import PocketBase from "pocketbase";
import { listUsers, getUser, createUser, updateUser, deleteUser, getAllUsers, UserCreateData } from "./user-service.js";
import { createClient } from "./client-factory.js";
import { authenticateAdminWithClient } from "./auth-service.js";
import { getTestConfig, isPocketBaseAvailable, generateTestId } from "./test-utils/helpers.js";
import { ErrorCode } from "./error-handler.js";

describe("PocketBase User Service", () => {
  const testConfig = getTestConfig();
  let pocketBaseAvailable = false;
  let adminClient: PocketBase;
  let unauthenticatedClient: PocketBase;
  const createdUserIds: string[] = [];
  const testCollection = "users";

  beforeAll(async () => {
    pocketBaseAvailable = await isPocketBaseAvailable(testConfig.baseUrl);
    if (!pocketBaseAvailable) {
      console.warn("PocketBase is not available - some tests will be skipped");
      adminClient = createClient({ baseUrl: testConfig.baseUrl });
      unauthenticatedClient = createClient({ baseUrl: testConfig.baseUrl });
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

    // Create unauthenticated client
    unauthenticatedClient = createClient({ baseUrl: testConfig.baseUrl });
  });

  afterAll(async () => {
    if (!pocketBaseAvailable) return;

    // Clean up test users
    for (const userId of createdUserIds) {
      try {
        await adminClient.collection(testCollection).delete(userId);
      } catch {
        // Ignore errors during cleanup
      }
    }
  });

  /**
   * Generate valid user data for testing
   */
  const validUserDataArbitrary = (): fc.Arbitrary<UserCreateData> => {
    return fc.record({
      email: fc
        .tuple(
          fc.stringMatching(/^[a-z]{3,8}$/),
          fc.stringMatching(/^[a-z]{3,8}$/),
          fc.constant(generateTestId().replace(/[^a-z0-9]/g, ""))
        )
        .map(([local, domain, unique]) => `${local}_${unique}@${domain}.test`),
      password: fc.constant("TestPassword123!"),
      passwordConfirm: fc.constant("TestPassword123!"),
      emailVisibility: fc.boolean(),
      verified: fc.boolean(),
      name: fc.option(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        { nil: undefined }
      ),
    });
  };

  /**
   * Helper to create a test user and track for cleanup
   */
  async function createTestUser(data?: Partial<UserCreateData>): Promise<string> {
    const uniqueId = generateTestId().replace(/[^a-z0-9]/g, "");
    const userData: UserCreateData = {
      email: `testuser_${uniqueId}@test.local`,
      password: "TestPassword123!",
      passwordConfirm: "TestPassword123!",
      emailVisibility: true,
      verified: false,
      ...data,
    };

    const result = await createUser(adminClient, testCollection, userData);
    createdUserIds.push(result.user.id);
    return result.user.id;
  }

  describe("Property 29: User creation round-trip", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 29: User creation round-trip
     * Validates: Requirements 7.1
     *
     * For any valid user data (email and password), creating a user and then
     * retrieving it should return equivalent user information with an assigned id.
     */
    it("should create user and retrieve equivalent data", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      await fc.assert(
        fc.asyncProperty(validUserDataArbitrary(), async (userData) => {
          // Create the user
          const createResult = await createUser(adminClient, testCollection, userData);
          createdUserIds.push(createResult.user.id);

          expect(createResult.success).toBe(true);
          expect(createResult.user.id).toBeDefined();
          expect(createResult.user.email).toBe(userData.email);

          // Retrieve the user
          const getResult = await getUser(adminClient, testCollection, createResult.user.id);

          expect(getResult.success).toBe(true);
          expect(getResult.user.id).toBe(createResult.user.id);
          expect(getResult.user.email).toBe(userData.email);
          expect(getResult.user.emailVisibility).toBe(userData.emailVisibility);
          expect(getResult.user.verified).toBe(userData.verified);

          return true;
        }),
        { numRuns: 5 }
      );
    });
  });

  describe("Property 30: User update persistence", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 30: User update persistence
     * Validates: Requirements 7.2
     *
     * For any existing user and valid update data, updating the user and then
     * retrieving it should reflect the updated information.
     */
    it("should persist user updates", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      // Create a test user first
      const userId = await createTestUser();

      await fc.assert(
        fc.asyncProperty(fc.boolean(), fc.boolean(), async (newEmailVisibility, newVerified) => {
          // Update the user
          const updateResult = await updateUser(adminClient, testCollection, userId, {
            emailVisibility: newEmailVisibility,
            verified: newVerified,
          });

          expect(updateResult.success).toBe(true);
          expect(updateResult.user.emailVisibility).toBe(newEmailVisibility);
          expect(updateResult.user.verified).toBe(newVerified);

          // Retrieve and verify
          const getResult = await getUser(adminClient, testCollection, userId);

          expect(getResult.success).toBe(true);
          expect(getResult.user.emailVisibility).toBe(newEmailVisibility);
          expect(getResult.user.verified).toBe(newVerified);

          return true;
        }),
        { numRuns: 5 }
      );
    });
  });

  describe("Property 31: User deletion removes user", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 31: User deletion removes user
     * Validates: Requirements 7.3
     *
     * For any existing user, after deletion, attempting to retrieve that user
     * should result in a not-found error.
     */
    it("should remove user after deletion", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      await fc.assert(
        fc.asyncProperty(validUserDataArbitrary(), async (userData) => {
          // Create a user
          const createResult = await createUser(adminClient, testCollection, userData);
          expect(createResult.success).toBe(true);

          const userId = createResult.user.id;

          // Verify it exists
          const getResult = await getUser(adminClient, testCollection, userId);
          expect(getResult.success).toBe(true);

          // Delete the user
          const deleteResult = await deleteUser(adminClient, testCollection, userId);
          expect(deleteResult.success).toBe(true);

          // Verify it no longer exists
          try {
            await getUser(adminClient, testCollection, userId);
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

  describe("Property 32: User list filtering correctness", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 32: User list filtering correctness
     * Validates: Requirements 7.4
     *
     * For any filter criteria, listing users should return only users matching
     * the filter criteria.
     */
    it("should return only users matching filter criteria", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      // Create test users with different verified statuses
      const verifiedUserId = await createTestUser({ verified: true });
      const unverifiedUserId = await createTestUser({ verified: false });

      // Test filtering by verified status
      const verifiedResult = await listUsers(adminClient, testCollection, {
        filter: "verified = true",
      });

      expect(verifiedResult.success).toBe(true);
      for (const user of verifiedResult.items) {
        expect(user.verified).toBe(true);
      }

      // Test filtering by unverified status
      const unverifiedResult = await listUsers(adminClient, testCollection, {
        filter: "verified = false",
      });

      expect(unverifiedResult.success).toBe(true);
      for (const user of unverifiedResult.items) {
        expect(user.verified).toBe(false);
      }

      // Verify our test users are in the correct lists
      const verifiedIds = verifiedResult.items.map((u) => u.id);
      const unverifiedIds = unverifiedResult.items.map((u) => u.id);

      expect(verifiedIds).toContain(verifiedUserId);
      expect(unverifiedIds).toContain(unverifiedUserId);
    });

    it("should filter users by email pattern", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      // Create a user with a specific email pattern
      const uniquePattern = `filtertest_${generateTestId().replace(/[^a-z0-9]/g, "")}`;
      const userId = await createTestUser({
        email: `${uniquePattern}@test.local`,
      });

      // Filter by email containing the pattern
      const result = await listUsers(adminClient, testCollection, {
        filter: `email ~ "${uniquePattern}"`,
      });

      expect(result.success).toBe(true);
      expect(result.items.length).toBeGreaterThanOrEqual(1);

      const foundUser = result.items.find((u) => u.id === userId);
      expect(foundUser).toBeDefined();
      expect(foundUser!.email).toContain(uniquePattern);
    });
  });

  describe("Property 33: Non-admin user management rejection", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 33: Non-admin user management rejection
     * Validates: Requirements 7.5
     *
     * For any user management operation (create, update, delete, list) attempted
     * with non-admin credentials, the operation should be rejected with an
     * authorization error.
     */
    it("should reject list users without admin auth", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      try {
        await listUsers(unauthenticatedClient, testCollection);
        expect.fail("Should have thrown authorization error");
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.FORBIDDEN);
      }
    });

    it("should reject get user without admin auth", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      // Create a user as admin first
      const userId = await createTestUser();

      try {
        await getUser(unauthenticatedClient, testCollection, userId);
        expect.fail("Should have thrown authorization error");
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.FORBIDDEN);
      }
    });

    it("should reject create user without admin auth", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      try {
        await createUser(unauthenticatedClient, testCollection, {
          email: `unauthorized_${generateTestId()}@test.local`,
          password: "TestPassword123!",
          passwordConfirm: "TestPassword123!",
        });
        expect.fail("Should have thrown authorization error");
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.FORBIDDEN);
      }
    });

    it("should reject update user without admin auth", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      // Create a user as admin first
      const userId = await createTestUser();

      try {
        await updateUser(unauthenticatedClient, testCollection, userId, {
          verified: true,
        });
        expect.fail("Should have thrown authorization error");
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.FORBIDDEN);
      }
    });

    it("should reject delete user without admin auth", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      // Create a user as admin first
      const userId = await createTestUser();

      try {
        await deleteUser(unauthenticatedClient, testCollection, userId);
        expect.fail("Should have thrown authorization error");
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.FORBIDDEN);
      }
    });
  });

  describe("Unit Tests - User Operations", () => {
    it("should handle pagination correctly", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      // Create multiple test users
      for (let i = 0; i < 5; i++) {
        await createTestUser();
      }

      // Test pagination
      const page1 = await listUsers(adminClient, testCollection, {
        page: 1,
        perPage: 2,
      });

      expect(page1.success).toBe(true);
      expect(page1.page).toBe(1);
      expect(page1.perPage).toBe(2);
      expect(page1.items.length).toBeLessThanOrEqual(2);

      if (page1.totalPages > 1) {
        const page2 = await listUsers(adminClient, testCollection, {
          page: 2,
          perPage: 2,
        });

        expect(page2.success).toBe(true);
        expect(page2.page).toBe(2);

        // Verify no overlap between pages
        const page1Ids = new Set(page1.items.map((u) => u.id));
        for (const user of page2.items) {
          expect(page1Ids.has(user.id)).toBe(false);
        }
      }
    });

    it("should return not found for non-existent user", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      try {
        await getUser(adminClient, testCollection, "nonexistent123456");
        expect.fail("Should have thrown not found error");
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.NOT_FOUND);
      }
    });

    it("should get all users without pagination", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      // Create a few test users
      await createTestUser();
      await createTestUser();

      const result = await getAllUsers(adminClient, testCollection);

      expect(result.success).toBe(true);
      expect(result.items.length).toBeGreaterThanOrEqual(2);
      expect(result.totalItems).toBe(result.items.length);
    });

    it("should sort users correctly", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      // Create test users
      await createTestUser();
      await createTestUser();

      // Test ascending sort by created
      const ascResult = await listUsers(adminClient, testCollection, {
        sort: "+created",
      });

      expect(ascResult.success).toBe(true);
      for (let i = 1; i < ascResult.items.length; i++) {
        const prev = new Date(ascResult.items[i - 1].created).getTime();
        const curr = new Date(ascResult.items[i].created).getTime();
        expect(curr).toBeGreaterThanOrEqual(prev);
      }

      // Test descending sort by created
      const descResult = await listUsers(adminClient, testCollection, {
        sort: "-created",
      });

      expect(descResult.success).toBe(true);
      for (let i = 1; i < descResult.items.length; i++) {
        const prev = new Date(descResult.items[i - 1].created).getTime();
        const curr = new Date(descResult.items[i].created).getTime();
        expect(curr).toBeLessThanOrEqual(prev);
      }
    });
  });
});
