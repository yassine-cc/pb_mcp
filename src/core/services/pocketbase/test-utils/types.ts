/**
 * Common TypeScript types for testing
 */

/**
 * Test context that can be shared across tests
 */
export interface TestContext {
  baseUrl: string;
  adminEmail: string;
  adminPassword: string;
  testPrefix: string;
}

/**
 * Mock response type for testing
 */
export interface MockResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

/**
 * Test collection schema for creating test collections
 */
export interface TestCollectionSchema {
  name: string;
  type: "base" | "auth" | "view";
  schema: Array<{
    id: string;
    name: string;
    type: string;
    required: boolean;
    options?: Record<string, any>;
  }>;
  listRule?: string | null;
  viewRule?: string | null;
  createRule?: string | null;
  updateRule?: string | null;
  deleteRule?: string | null;
}

/**
 * Test record type
 */
export interface TestRecord {
  id: string;
  collectionId: string;
  collectionName: string;
  created: string;
  updated: string;
  [key: string]: any;
}

/**
 * Test user type
 */
export interface TestUser {
  id: string;
  email: string;
  verified: boolean;
  emailVisibility: boolean;
  created: string;
  updated: string;
  [key: string]: any;
}

/**
 * Property test result
 */
export interface PropertyTestResult {
  passed: boolean;
  numRuns: number;
  counterexample?: any;
  error?: Error;
}
