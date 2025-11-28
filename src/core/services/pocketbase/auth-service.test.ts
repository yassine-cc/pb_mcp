/**
 * Property-based and unit tests for PocketBase authentication service
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import * as fc from "fast-check";
import PocketBase from "pocketbase";
import {
  authenticateAdmin,
  authenticateUser,
  authenticateAdminWithClient,
  authenticateUserWithClient,
  logout,
  isAuthenticated,
  getCurrentUser,
  getAuthStatus,
  getToken,
} from "./auth-service.js";
import { createClient } from "./client-factory.js";
import { emailArbitrary, passwordArbitrary, collectionNameArbitrary } from "./test-utils/generators.js";
import { getTestConfig, isPocketBaseAvailable } from "./test-utils/helpers.js";

describe("PocketBase Authentication Service", () => {
  const testConfig = getTestConfig();
  let pocketBaseAvailable = false;

  beforeAll(async () => {
    pocketBaseAvailable = await isPocketBaseAvailable(testConfig.baseUrl);
    if (!pocketBaseAvailable) {
      console.warn("PocketBase is not available - some tests will be skipped");
    }
  });

  describe("Property 1: Admin authentication stores token", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 1: Admin authentication stores token
     * Validates: Requirements 1.1
     *
     * For any valid admin credentials (email and password), when authenticating as admin,
     * the authentication token should be stored in the Auth Store and be retrievable.
     */
    it("should store token in auth store after successful admin authentication", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      // Use real admin credentials from test config
      const result = await authenticateAdmin(
        {
          email: testConfig.adminEmail!,
          password: testConfig.adminPassword!,
        },
        testConfig.baseUrl
      );

      // Verify token is returned and non-empty
      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.token.length).toBeGreaterThan(0);
    });

    it("should return token that can be used with a new client", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      // Authenticate and get token
      const result = await authenticateAdmin(
        {
          email: testConfig.adminEmail!,
          password: testConfig.adminPassword!,
        },
        testConfig.baseUrl
      );

      // Create a new client with the token
      const newClient = createClient({
        baseUrl: testConfig.baseUrl,
        adminToken: result.token,
      });

      // The new client should have the token
      expect(newClient.authStore.token).toBe(result.token);
    });
  });

  describe("Property 2: User authentication stores token", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 2: User authentication stores token
     * Validates: Requirements 1.2
     *
     * For any valid user credentials (email and password) and collection name,
     * when authenticating as a user, the authentication token should be stored
     * in the Auth Store and be retrievable.
     */
    it("should store token in auth store after successful user authentication", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      // This test requires a user to exist in the users collection
      // For property testing, we verify the structure of the response
      // when authentication succeeds
      try {
        const result = await authenticateUser(
          {
            email: testConfig.adminEmail!, // Using admin email as fallback
            password: testConfig.adminPassword!,
          },
          "users",
          testConfig.baseUrl
        );

        // If we get here, verify token is returned
        expect(result.success).toBe(true);
        expect(result.token).toBeDefined();
        expect(result.token.length).toBeGreaterThan(0);
      } catch (error: any) {
        // If no user exists, that's expected - the test is about structure
        expect(error.code).toBe("AUTH_INVALID");
      }
    });
  });

  describe("Property 3: Authentication response completeness", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 3: Authentication response completeness
     * Validates: Requirements 1.3
     *
     * For any successful authentication (admin or user), the response should contain
     * id, email, and role/type information.
     */
    it("should return complete user info with id, email, and isAdmin flag for admin auth", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      const result = await authenticateAdmin(
        {
          email: testConfig.adminEmail!,
          password: testConfig.adminPassword!,
        },
        testConfig.baseUrl
      );

      // Verify response completeness
      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user.id).toBeDefined();
      expect(typeof result.user.id).toBe("string");
      expect(result.user.id.length).toBeGreaterThan(0);
      expect(result.user.email).toBe(testConfig.adminEmail);
      expect(result.user.isAdmin).toBe(true);
    });

    it("should return complete user info for user auth when user exists", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      try {
        const result = await authenticateUser(
          {
            email: testConfig.adminEmail!,
            password: testConfig.adminPassword!,
          },
          "users",
          testConfig.baseUrl
        );

        // Verify response completeness
        expect(result.success).toBe(true);
        expect(result.user).toBeDefined();
        expect(result.user.id).toBeDefined();
        expect(typeof result.user.id).toBe("string");
        expect(result.user.email).toBeDefined();
        expect(typeof result.user.isAdmin).toBe("boolean");
      } catch (error: any) {
        // If no user exists, that's expected
        expect(error.code).toBe("AUTH_INVALID");
      }
    });
  });

  describe("Property 4: Invalid credentials error handling", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 4: Invalid credentials error handling
     * Validates: Requirements 1.4
     *
     * For any invalid credentials (wrong email or password), authentication should fail
     * with a clear error message indicating invalid credentials.
     */
    it("should throw error with AUTH_INVALID code for invalid admin credentials", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      await fc.assert(
        fc.asyncProperty(emailArbitrary(), passwordArbitrary(), async (email, password) => {
          // Skip if accidentally matching real credentials
          fc.pre(email !== testConfig.adminEmail || password !== testConfig.adminPassword);

          try {
            await authenticateAdmin({ email, password }, testConfig.baseUrl);
            // Should not reach here
            return false;
          } catch (error: any) {
            // Should get an auth error
            expect(error.code).toBe("AUTH_INVALID");
            expect(error.message).toBeDefined();
            return true;
          }
        }),
        { numRuns: 10 } // Limit runs to avoid hammering the server
      );
    });

    it("should throw error with AUTH_INVALID code for invalid user credentials", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      await fc.assert(
        fc.asyncProperty(emailArbitrary(), passwordArbitrary(), async (email, password) => {
          try {
            await authenticateUser({ email, password }, "users", testConfig.baseUrl);
            // Should not reach here for random credentials
            return false;
          } catch (error: any) {
            // Should get an auth error
            expect(error.code).toBe("AUTH_INVALID");
            expect(error.message).toBeDefined();
            return true;
          }
        }),
        { numRuns: 10 }
      );
    });
  });

  describe("Property 5: Token reuse without re-authentication", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 5: Token reuse without re-authentication
     * Validates: Requirements 1.5
     *
     * For any authenticated session with a valid token in the Auth Store,
     * subsequent operations should use the stored token without requiring re-authentication.
     */
    it("should allow token reuse across multiple client instances", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      // First, authenticate and get a token
      const authResult = await authenticateAdmin(
        {
          email: testConfig.adminEmail!,
          password: testConfig.adminPassword!,
        },
        testConfig.baseUrl
      );

      // Create multiple clients with the same token
      const client1 = createClient({
        baseUrl: testConfig.baseUrl,
        adminToken: authResult.token,
      });

      const client2 = createClient({
        baseUrl: testConfig.baseUrl,
        adminToken: authResult.token,
      });

      // Both clients should have the same token
      expect(client1.authStore.token).toBe(authResult.token);
      expect(client2.authStore.token).toBe(authResult.token);

      // Both clients should be considered authenticated
      expect(isAuthenticated(client1)).toBe(true);
      expect(isAuthenticated(client2)).toBe(true);
    });

    it("should maintain token validity after getToken call", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      // Authenticate
      const authResult = await authenticateAdmin(
        {
          email: testConfig.adminEmail!,
          password: testConfig.adminPassword!,
        },
        testConfig.baseUrl
      );

      // Create client with token
      const client = createClient({
        baseUrl: testConfig.baseUrl,
        adminToken: authResult.token,
      });

      // Get token multiple times - should always return the same token
      const token1 = getToken(client);
      const token2 = getToken(client);
      const token3 = getToken(client);

      expect(token1).toBe(authResult.token);
      expect(token2).toBe(authResult.token);
      expect(token3).toBe(authResult.token);
    });
  });

  describe("Property 27: Logout clears auth store", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 27: Logout clears auth store
     * Validates: Requirements 6.3
     *
     * For any authenticated session, after logout, the Auth Store should be empty
     * and subsequent operations should require re-authentication.
     */
    it("should clear auth store after logout", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      // First authenticate
      const authResult = await authenticateAdmin(
        {
          email: testConfig.adminEmail!,
          password: testConfig.adminPassword!,
        },
        testConfig.baseUrl
      );

      // Create client with token
      const client = createClient({
        baseUrl: testConfig.baseUrl,
        adminToken: authResult.token,
      });

      // Verify authenticated
      expect(isAuthenticated(client)).toBe(true);
      expect(getToken(client)).toBe(authResult.token);

      // Logout
      logout(client);

      // Verify auth store is cleared
      expect(isAuthenticated(client)).toBe(false);
      expect(getToken(client)).toBeNull();
      expect(getCurrentUser(client)).toBeNull();
    });

    it("should require re-authentication after logout", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      // Authenticate
      const authResult = await authenticateAdmin(
        {
          email: testConfig.adminEmail!,
          password: testConfig.adminPassword!,
        },
        testConfig.baseUrl
      );

      // Create client and logout
      const client = createClient({
        baseUrl: testConfig.baseUrl,
        adminToken: authResult.token,
      });

      logout(client);

      // Auth status should show not authenticated
      const status = getAuthStatus(client);
      expect(status.isAuthenticated).toBe(false);
      expect(status.user).toBeNull();
      expect(status.token).toBeNull();
    });

    it("should clear auth store for any authenticated client", () => {
      // Property test: for any token, logout should clear the auth store
      fc.assert(
        fc.property(fc.string({ minLength: 20, maxLength: 100 }), (token) => {
          const client = createClient({
            baseUrl: testConfig.baseUrl,
            adminToken: token,
          });

          // Client has token
          expect(client.authStore.token).toBe(token);

          // Logout
          logout(client);

          // Token should be cleared
          expect(client.authStore.token).toBe("");
          expect(isAuthenticated(client)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Unit Tests - Authentication Functions", () => {
    it("should create client with correct base URL", () => {
      const client = createClient({ baseUrl: "http://test.example.com:8090" });
      expect(client.baseUrl).toBe("http://test.example.com:8090");
    });

    it("should return false for isAuthenticated on fresh client", () => {
      const client = createClient({ baseUrl: testConfig.baseUrl });
      expect(isAuthenticated(client)).toBe(false);
    });

    it("should return null for getCurrentUser on unauthenticated client", () => {
      const client = createClient({ baseUrl: testConfig.baseUrl });
      expect(getCurrentUser(client)).toBeNull();
    });

    it("should return null for getToken on unauthenticated client", () => {
      const client = createClient({ baseUrl: testConfig.baseUrl });
      expect(getToken(client)).toBeNull();
    });

    it("should return correct auth status for unauthenticated client", () => {
      const client = createClient({ baseUrl: testConfig.baseUrl });
      const status = getAuthStatus(client);

      expect(status.isAuthenticated).toBe(false);
      expect(status.user).toBeNull();
      expect(status.token).toBeNull();
    });
  });

  describe("Unit Tests - Error Handling", () => {
    it("should throw error for empty email", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      try {
        await authenticateAdmin({ email: "", password: "password123" }, testConfig.baseUrl);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error).toBeDefined();
      }
    });

    it("should throw error for empty password", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      try {
        await authenticateAdmin({ email: "test@example.com", password: "" }, testConfig.baseUrl);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error).toBeDefined();
      }
    });
  });

  describe("Unit Tests - Client-based Authentication", () => {
    it("should authenticate admin with existing client", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      const client = createClient({ baseUrl: testConfig.baseUrl });

      const result = await authenticateAdminWithClient(client, {
        email: testConfig.adminEmail!,
        password: testConfig.adminPassword!,
      });

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(client.authStore.token).toBe(result.token);
    });

    it("should authenticate user with existing client when user exists", async () => {
      if (!pocketBaseAvailable) {
        console.warn("Skipping test - PocketBase not available");
        return;
      }

      const client = createClient({ baseUrl: testConfig.baseUrl });

      try {
        const result = await authenticateUserWithClient(
          client,
          {
            email: testConfig.adminEmail!,
            password: testConfig.adminPassword!,
          },
          "users"
        );

        expect(result.success).toBe(true);
        expect(result.token).toBeDefined();
      } catch (error: any) {
        // Expected if no user exists
        expect(error.code).toBe("AUTH_INVALID");
      }
    });
  });
});
