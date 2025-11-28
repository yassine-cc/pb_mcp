/**
 * Test helper utilities for PocketBase testing
 */

import PocketBase from "pocketbase";

/**
 * Configuration for test PocketBase instance
 */
export interface TestConfig {
  baseUrl?: string;
  adminEmail?: string;
  adminPassword?: string;
}

/**
 * Get test configuration from environment variables
 */
export function getTestConfig(): TestConfig {
  return {
    baseUrl: process.env.POCKETBASE_TEST_URL || "http://127.0.0.1:8090",
    adminEmail: process.env.POCKETBASE_TEST_ADMIN_EMAIL || "test@example.com",
    adminPassword: process.env.POCKETBASE_TEST_ADMIN_PASSWORD || "testpassword123",
  };
}

/**
 * Create a test PocketBase client
 */
export function createTestClient(baseUrl?: string): PocketBase {
  const config = getTestConfig();
  return new PocketBase(baseUrl || config.baseUrl);
}

/**
 * Authenticate as admin for testing
 */
export async function authenticateAsAdmin(pb: PocketBase): Promise<void> {
  const config = getTestConfig();
  try {
    await pb.admins.authWithPassword(config.adminEmail!, config.adminPassword!);
  } catch (error) {
    console.warn("Admin authentication failed in test setup:", error);
    // Don't throw - some tests may not need admin auth
  }
}

/**
 * Clean up test collections (for integration tests)
 */
export async function cleanupTestCollections(pb: PocketBase, prefix: string = "test_"): Promise<void> {
  try {
    const collections = await pb.collections.getFullList();
    for (const collection of collections) {
      if (collection.name.startsWith(prefix)) {
        await pb.collections.delete(collection.id);
      }
    }
  } catch (error) {
    console.warn("Failed to cleanup test collections:", error);
  }
}

/**
 * Clean up test users (for integration tests)
 */
export async function cleanupTestUsers(
  pb: PocketBase,
  collection: string = "users",
  emailPrefix: string = "test_"
): Promise<void> {
  try {
    const users = await pb.collection(collection).getFullList();
    for (const user of users) {
      if (user.email?.startsWith(emailPrefix)) {
        await pb.collection(collection).delete(user.id);
      }
    }
  } catch (error) {
    console.warn("Failed to cleanup test users:", error);
  }
}

/**
 * Wait for a condition to be true (useful for async operations)
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

/**
 * Generate a unique test identifier
 */
export function generateTestId(): string {
  return `test_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Check if PocketBase is available
 */
export async function isPocketBaseAvailable(baseUrl?: string): Promise<boolean> {
  const config = getTestConfig();
  const url = baseUrl || config.baseUrl;

  try {
    const response = await fetch(`${url}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Skip test if PocketBase is not available
 */
export async function skipIfPocketBaseUnavailable(): Promise<void> {
  const available = await isPocketBaseAvailable();
  if (!available) {
    console.warn("PocketBase is not available - skipping test");
    // In Vitest, we can use test.skip() but this helper can be called in beforeAll
  }
}

/**
 * Create a mock error response for testing error handlers
 */
export function createMockPocketBaseError(status: number, message: string, data?: any): any {
  return {
    status,
    message,
    data,
    isAbort: false,
    originalError: null,
  };
}

/**
 * Assert that an error has expected properties
 */
export function assertErrorResponse(error: any, expectedCode?: string, expectedMessage?: string): void {
  if (expectedCode && error.code !== expectedCode) {
    throw new Error(`Expected error code ${expectedCode}, got ${error.code}`);
  }

  if (expectedMessage && !error.error?.includes(expectedMessage)) {
    throw new Error(`Expected error message to include "${expectedMessage}", got "${error.error}"`);
  }
}

/**
 * Retry an operation with exponential backoff
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 100
): Promise<T> {
  let lastError: any;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
