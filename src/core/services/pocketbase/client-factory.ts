/**
 * PocketBase Client Factory
 *
 * Creates and configures PocketBase client instances with proper authentication
 * and configuration management.
 *
 * Configuration precedence: explicit params > env vars > defaults
 */

import PocketBase from "pocketbase";
import dotenv from "dotenv";

// Load environment variables
dotenv.config({ debug: false });

/**
 * Configuration options for creating a PocketBase client
 */
export interface PocketBaseClientConfig {
  baseUrl?: string;
  adminToken?: string;
  userToken?: string;
}

/**
 * Default PocketBase URL
 */
const DEFAULT_POCKETBASE_URL = "http://127.0.0.1:8090";

/**
 * Normalize URL by removing trailing slash for consistent comparison
 */
function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Get the PocketBase URL from configuration with proper precedence
 *
 * Precedence: explicit param > env var > default
 *
 * @param explicitUrl - Explicitly provided URL (highest priority)
 * @returns The resolved PocketBase URL (normalized, without trailing slash)
 */
export function getPocketBaseUrl(explicitUrl?: string): string {
  let url: string;

  // 1. Explicit parameter (highest priority)
  if (explicitUrl) {
    url = explicitUrl;
  }
  // 2. Environment variable
  else if (process.env.POCKETBASE_URL) {
    url = process.env.POCKETBASE_URL;
  }
  // 3. Default fallback
  else {
    url = DEFAULT_POCKETBASE_URL;
  }

  return normalizeUrl(url);
}

/**
 * Create a PocketBase client instance
 *
 * @param config - Configuration options
 * @returns Configured PocketBase client
 */
export function createClient(config: PocketBaseClientConfig = {}): PocketBase {
  const baseUrl = getPocketBaseUrl(config.baseUrl);
  const client = new PocketBase(baseUrl);

  // Set authentication token if provided
  if (config.adminToken) {
    client.authStore.save(config.adminToken, null);
  } else if (config.userToken) {
    client.authStore.save(config.userToken, null);
  }

  return client;
}

/**
 * Create a PocketBase client configured for admin operations
 *
 * @param config - Configuration options
 * @returns Configured PocketBase client for admin use
 */
export function createAdminClient(config: PocketBaseClientConfig = {}): PocketBase {
  const baseUrl = getPocketBaseUrl(config.baseUrl);
  const client = new PocketBase(baseUrl);

  // Use admin token from config or environment
  const adminToken = config.adminToken || process.env.POCKETBASE_ADMIN_TOKEN;
  if (adminToken) {
    client.authStore.save(adminToken, null);
  }

  return client;
}

/**
 * Create a PocketBase client configured for user operations
 *
 * @param config - Configuration options
 * @returns Configured PocketBase client for user use
 */
export function createUserClient(config: PocketBaseClientConfig = {}): PocketBase {
  const baseUrl = getPocketBaseUrl(config.baseUrl);
  const client = new PocketBase(baseUrl);

  // Use user token from config
  if (config.userToken) {
    client.authStore.save(config.userToken, null);
  }

  return client;
}
