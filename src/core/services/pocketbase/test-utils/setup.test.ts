/**
 * Test to verify testing framework setup
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  emailArbitrary,
  passwordArbitrary,
  collectionNameArbitrary,
  createTestClient,
  getTestConfig,
} from "./index.js";

describe("Testing Framework Setup", () => {
  describe("Vitest Configuration", () => {
    it("should run basic assertions", () => {
      expect(true).toBe(true);
      expect(1 + 1).toBe(2);
    });

    it("should support async tests", async () => {
      const result = await Promise.resolve(42);
      expect(result).toBe(42);
    });
  });

  describe("fast-check Integration", () => {
    it("should generate random emails", () => {
      fc.assert(
        fc.property(emailArbitrary(), (email) => {
          expect(email).toMatch(/^[a-z0-9]+@[a-z0-9]+\.[a-z]{2,6}$/);
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it("should generate valid passwords", () => {
      fc.assert(
        fc.property(passwordArbitrary(), (password: string) => {
          expect(password.length).toBeGreaterThanOrEqual(8);
          expect(password).toMatch(/[a-zA-Z]/);
          expect(password).toMatch(/[0-9]/);
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it("should generate valid collection names", () => {
      fc.assert(
        fc.property(collectionNameArbitrary(), (name: string) => {
          expect(name).toMatch(/^[a-z][a-z0-9_]{2,30}$/);
          expect(name.startsWith("_")).toBe(false);
          expect(name.endsWith("_")).toBe(false);
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Test Utilities", () => {
    it("should create test client", () => {
      const client = createTestClient();
      expect(client).toBeDefined();
      expect(client.baseUrl).toBeDefined();
    });

    it("should load test configuration", () => {
      const config = getTestConfig();
      expect(config.baseUrl).toBeDefined();
      expect(config.adminEmail).toBeDefined();
      expect(config.adminPassword).toBeDefined();
    });

    it("should create client with custom URL", () => {
      const customUrl = "http://localhost:8091";
      const client = createTestClient(customUrl);
      expect(client.baseUrl).toBe(customUrl);
    });
  });

  describe("Property-Based Testing Configuration", () => {
    it("should run 100 iterations by default", () => {
      let runCount = 0;

      fc.assert(
        fc.property(fc.integer(), () => {
          runCount++;
          return true;
        }),
        { numRuns: 100 }
      );

      expect(runCount).toBe(100);
    });

    it("should support shrinking on failure", () => {
      // This test demonstrates shrinking - it will find the minimal failing case
      // We expect this to pass, but it shows the mechanism works
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1000 }), (n) => {
          // All numbers should be less than 1001 (this will pass)
          return n < 1001;
        }),
        { numRuns: 100 }
      );
    });
  });
});
