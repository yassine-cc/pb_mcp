/**
 * Property-based and unit tests for PocketBase client factory
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import { createClient, createAdminClient, createUserClient, getPocketBaseUrl } from "./client-factory.js";
import { urlArbitrary } from "./test-utils/generators.js";

describe("PocketBase Client Factory", () => {
  // Store original env vars to restore after tests
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear relevant env vars before each test
    delete process.env.POCKETBASE_URL;
    delete process.env.POCKETBASE_ADMIN_TOKEN;
  });

  afterEach(() => {
    // Restore original env vars
    process.env = { ...originalEnv };
  });

  describe("Property 37: Explicit URL parameter precedence", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 37: Explicit URL parameter precedence
     * Validates: Requirements 9.2
     *
     * For any tool invocation with an explicit baseUrl parameter, that URL should be used
     * instead of the default configuration.
     */
    it("should use explicit baseUrl over environment variable and default", () => {
      fc.assert(
        fc.property(urlArbitrary(), urlArbitrary(), (explicitUrl, envUrl) => {
          // Set environment variable
          process.env.POCKETBASE_URL = envUrl;

          // Create client with explicit URL
          const client = createClient({ baseUrl: explicitUrl });

          // The client should use the explicit URL, not the env var
          expect(client.baseUrl as string).toBe(explicitUrl);
        }),
        { numRuns: 100 }
      );
    });

    it("should use explicit baseUrl in getPocketBaseUrl function", () => {
      fc.assert(
        fc.property(urlArbitrary(), urlArbitrary(), (explicitUrl, envUrl) => {
          // Set environment variable
          process.env.POCKETBASE_URL = envUrl;

          // Get URL with explicit parameter
          const resolvedUrl = getPocketBaseUrl(explicitUrl);

          // Should return the explicit URL
          expect(resolvedUrl).toBe(explicitUrl);
        }),
        { numRuns: 100 }
      );
    });

    it("should use explicit baseUrl for admin client", () => {
      fc.assert(
        fc.property(urlArbitrary(), urlArbitrary(), (explicitUrl, envUrl) => {
          // Set environment variable
          process.env.POCKETBASE_URL = envUrl;

          // Create admin client with explicit URL
          const client = createAdminClient({ baseUrl: explicitUrl });

          // The client should use the explicit URL
          expect(client.baseUrl as string).toBe(explicitUrl);
        }),
        { numRuns: 100 }
      );
    });

    it("should use explicit baseUrl for user client", () => {
      fc.assert(
        fc.property(urlArbitrary(), urlArbitrary(), (explicitUrl, envUrl) => {
          // Set environment variable
          process.env.POCKETBASE_URL = envUrl;

          // Create user client with explicit URL
          const client = createUserClient({ baseUrl: explicitUrl });

          // The client should use the explicit URL
          expect(client.baseUrl as string).toBe(explicitUrl);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 39: Multi-instance URL independence", () => {
    /**
     * Feature: pocketbase-mcp-enhancement, Property 39: Multi-instance URL independence
     * Validates: Requirements 9.5
     *
     * For any two requests with different baseUrl parameters, they should connect to
     * independent PocketBase instances without interference.
     */
    it("should create independent clients with different URLs", () => {
      fc.assert(
        fc.property(urlArbitrary(), urlArbitrary(), (url1, url2) => {
          // Ensure URLs are different
          fc.pre(url1 !== url2);

          // Create two clients with different URLs
          const client1 = createClient({ baseUrl: url1 });
          const client2 = createClient({ baseUrl: url2 });

          // Each client should have its own URL
          expect(client1.baseUrl as string).toBe(url1);
          expect(client2.baseUrl as string).toBe(url2);

          // Clients should be independent instances
          expect(client1).not.toBe(client2);
        }),
        { numRuns: 100 }
      );
    });

    it("should maintain independent auth stores for different instances", () => {
      fc.assert(
        fc.property(
          urlArbitrary(),
          urlArbitrary(),
          fc.string({ minLength: 20, maxLength: 50 }),
          fc.string({ minLength: 20, maxLength: 50 }),
          (url1, url2, token1, token2) => {
            // Ensure URLs and tokens are different
            fc.pre(url1 !== url2 && token1 !== token2);

            // Create two clients with different URLs and tokens
            const client1 = createClient({ baseUrl: url1, adminToken: token1 });
            const client2 = createClient({ baseUrl: url2, adminToken: token2 });

            // Each client should have its own token
            expect(client1.authStore.token).toBe(token1);
            expect(client2.authStore.token).toBe(token2);

            // Modifying one auth store should not affect the other
            client1.authStore.clear();
            expect(client1.authStore.token).toBe("");
            expect(client2.authStore.token).toBe(token2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should support multiple admin clients with different URLs", () => {
      fc.assert(
        fc.property(urlArbitrary(), urlArbitrary(), (url1, url2) => {
          // Ensure URLs are different
          fc.pre(url1 !== url2);

          // Create two admin clients with different URLs
          const adminClient1 = createAdminClient({ baseUrl: url1 });
          const adminClient2 = createAdminClient({ baseUrl: url2 });

          // Each client should have its own URL
          expect(adminClient1.baseUrl as string).toBe(url1);
          expect(adminClient2.baseUrl as string).toBe(url2);

          // Clients should be independent
          expect(adminClient1).not.toBe(adminClient2);
        }),
        { numRuns: 100 }
      );
    });

    it("should support multiple user clients with different URLs", () => {
      fc.assert(
        fc.property(urlArbitrary(), urlArbitrary(), (url1, url2) => {
          // Ensure URLs are different
          fc.pre(url1 !== url2);

          // Create two user clients with different URLs
          const userClient1 = createUserClient({ baseUrl: url1 });
          const userClient2 = createUserClient({ baseUrl: url2 });

          // Each client should have its own URL
          expect(userClient1.baseUrl as string).toBe(url1);
          expect(userClient2.baseUrl as string).toBe(url2);

          // Clients should be independent
          expect(userClient1).not.toBe(userClient2);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Unit Tests - Default URL Configuration", () => {
    it("should use default URL when no configuration is provided", () => {
      const client = createClient();
      expect(client.baseUrl as string).toBe("http://127.0.0.1:8090");
    });

    it("should use default URL in getPocketBaseUrl when no params or env vars", () => {
      const url = getPocketBaseUrl();
      expect(url).toBe("http://127.0.0.1:8090");
    });

    it("should create admin client with default URL", () => {
      const client = createAdminClient();
      expect(client.baseUrl as string).toBe("http://127.0.0.1:8090");
    });

    it("should create user client with default URL", () => {
      const client = createUserClient();
      expect(client.baseUrl as string).toBe("http://127.0.0.1:8090");
    });
  });

  describe("Unit Tests - Environment Variable Reading", () => {
    it("should use POCKETBASE_URL from environment when no explicit URL", () => {
      process.env.POCKETBASE_URL = "http://localhost:9000";

      const client = createClient();
      expect(client.baseUrl as string).toBe("http://localhost:9000");
    });

    it("should use POCKETBASE_URL in getPocketBaseUrl", () => {
      process.env.POCKETBASE_URL = "http://test.example.com:8080";

      const url = getPocketBaseUrl();
      expect(url).toBe("http://test.example.com:8080");
    });

    it("should use POCKETBASE_ADMIN_TOKEN from environment for admin client", () => {
      process.env.POCKETBASE_ADMIN_TOKEN = "test-admin-token-123";

      const client = createAdminClient();
      expect(client.authStore.token).toBe("test-admin-token-123");
    });

    it("should prefer explicit admin token over environment variable", () => {
      process.env.POCKETBASE_ADMIN_TOKEN = "env-token";

      const client = createAdminClient({ adminToken: "explicit-token" });
      expect(client.authStore.token).toBe("explicit-token");
    });
  });

  describe("Unit Tests - Explicit Parameter Override", () => {
    it("should override environment URL with explicit baseUrl", () => {
      process.env.POCKETBASE_URL = "http://env.example.com";

      const client = createClient({ baseUrl: "http://explicit.example.com" });
      expect(client.baseUrl as string).toBe("http://explicit.example.com");
    });

    it("should set admin token when provided explicitly", () => {
      const client = createClient({ adminToken: "my-admin-token" });
      expect(client.authStore.token).toBe("my-admin-token");
    });

    it("should set user token when provided explicitly", () => {
      const client = createClient({ userToken: "my-user-token" });
      expect(client.authStore.token).toBe("my-user-token");
    });

    it("should prefer admin token over user token when both provided", () => {
      const client = createClient({
        adminToken: "admin-token",
        userToken: "user-token",
      });
      expect(client.authStore.token).toBe("admin-token");
    });

    it("should create admin client with explicit token", () => {
      const client = createAdminClient({ adminToken: "explicit-admin-token" });
      expect(client.authStore.token).toBe("explicit-admin-token");
    });

    it("should create user client with explicit token", () => {
      const client = createUserClient({ userToken: "explicit-user-token" });
      expect(client.authStore.token).toBe("explicit-user-token");
    });
  });

  describe("Unit Tests - Client Independence", () => {
    it("should create separate client instances", () => {
      const client1 = createClient();
      const client2 = createClient();

      expect(client1).not.toBe(client2);
    });

    it("should maintain independent auth stores", () => {
      const client1 = createClient({ adminToken: "token1" });
      const client2 = createClient({ adminToken: "token2" });

      expect(client1.authStore.token).toBe("token1");
      expect(client2.authStore.token).toBe("token2");

      client1.authStore.clear();
      expect(client1.authStore.token).toBe("");
      expect(client2.authStore.token).toBe("token2");
    });
  });
});
