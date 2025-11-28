/**
 * Authentication Service for PocketBase
 *
 * Handles user and admin authentication operations including:
 * - Admin authentication via email/password
 * - User authentication with collection specification
 * - Session management and token storage
 * - Authentication status checking
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 6.1, 6.2, 6.3, 6.5
 */

import PocketBase, { RecordModel } from "pocketbase";
import { createClient, getPocketBaseUrl } from "./client-factory.js";

/**
 * Credentials for authentication
 */
export interface AuthCredentials {
  email: string;
  password: string;
}

/**
 * Response from successful authentication
 */
export interface AuthResponse {
  success: true;
  token: string;
  user: {
    id: string;
    email: string;
    verified?: boolean;
    isAdmin: boolean;
    [key: string]: any;
  };
}

/**
 * Error response from failed authentication
 */
export interface AuthErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: any;
}

/**
 * Authentication status response
 */
export interface AuthStatusResponse {
  isAuthenticated: boolean;
  user: {
    id: string;
    email: string;
    isAdmin: boolean;
    [key: string]: any;
  } | null;
  token: string | null;
}

/**
 * The superusers collection name for admin authentication in PocketBase 0.26+
 */
const SUPERUSERS_COLLECTION = "_superusers";

/**
 * Authenticate as admin with email and password
 *
 * In PocketBase 0.26+, admins are stored in the _superusers collection.
 *
 * @param credentials - Admin email and password
 * @param baseUrl - Optional PocketBase URL override
 * @returns Authentication response with token and admin info
 * @throws Error if authentication fails
 *
 * Requirements: 1.1, 1.3, 1.4, 6.1
 */
export async function authenticateAdmin(credentials: AuthCredentials, baseUrl?: string): Promise<AuthResponse> {
  const url = getPocketBaseUrl(baseUrl);
  const pb = createClient({ baseUrl: url });

  try {
    // In PocketBase 0.26+, admins authenticate via the _superusers collection
    const authData = await pb
      .collection(SUPERUSERS_COLLECTION)
      .authWithPassword(credentials.email, credentials.password);

    // Token is automatically stored in authStore by the SDK
    return {
      success: true,
      token: pb.authStore.token,
      user: {
        id: authData.record.id,
        collectionName: SUPERUSERS_COLLECTION,
        email: authData.record.email,
        verified: true, // Admins are always verified
        isAdmin: true,
        created: authData.record.created,
        updated: authData.record.updated,
      },
    };
  } catch (error: any) {
    throw createAuthError(error, "Admin authentication failed");
  }
}

/**
 * Authenticate as a user with email and password
 *
 * @param credentials - User email and password
 * @param collection - The auth collection name (e.g., "users")
 * @param baseUrl - Optional PocketBase URL override
 * @returns Authentication response with token and user info
 * @throws Error if authentication fails
 *
 * Requirements: 1.2, 1.3, 1.4, 6.1
 */
export async function authenticateUser(
  credentials: AuthCredentials,
  collection: string = "users",
  baseUrl?: string
): Promise<AuthResponse> {
  const url = getPocketBaseUrl(baseUrl);
  const pb = createClient({ baseUrl: url });

  try {
    const authData = await pb.collection(collection).authWithPassword(credentials.email, credentials.password);

    // Token is automatically stored in authStore by the SDK
    return {
      success: true,
      token: pb.authStore.token,
      user: {
        id: authData.record.id,
        email: authData.record.email,
        verified: authData.record.verified ?? false,
        isAdmin: false,
        collectionId: authData.record.collectionId,
        collectionName: authData.record.collectionName,
        created: authData.record.created,
        updated: authData.record.updated,
        ...extractUserFields(authData.record),
      },
    };
  } catch (error: any) {
    throw createAuthError(error, "User authentication failed");
  }
}

/**
 * Authenticate as admin using an existing PocketBase client
 *
 * @param pb - PocketBase client instance
 * @param credentials - Admin email and password
 * @returns Authentication response with token and admin info
 *
 * Requirements: 1.1, 1.3, 1.4, 6.1
 */
export async function authenticateAdminWithClient(pb: PocketBase, credentials: AuthCredentials): Promise<AuthResponse> {
  try {
    const authData = await pb
      .collection(SUPERUSERS_COLLECTION)
      .authWithPassword(credentials.email, credentials.password);

    return {
      success: true,
      token: pb.authStore.token,
      user: {
        id: authData.record.id,
        email: authData.record.email,
        verified: true,
        isAdmin: true,
        created: authData.record.created,
        updated: authData.record.updated,
      },
    };
  } catch (error: any) {
    throw createAuthError(error, "Admin authentication failed");
  }
}

/**
 * Authenticate as user using an existing PocketBase client
 *
 * @param pb - PocketBase client instance
 * @param credentials - User email and password
 * @param collection - The auth collection name (e.g., "users")
 * @returns Authentication response with token and user info
 *
 * Requirements: 1.2, 1.3, 1.4, 6.1
 */
export async function authenticateUserWithClient(
  pb: PocketBase,
  credentials: AuthCredentials,
  collection: string = "users"
): Promise<AuthResponse> {
  try {
    const authData = await pb.collection(collection).authWithPassword(credentials.email, credentials.password);

    return {
      success: true,
      token: pb.authStore.token,
      user: {
        id: authData.record.id,
        email: authData.record.email,
        verified: authData.record.verified ?? false,
        isAdmin: false,
        collectionId: authData.record.collectionId,
        collectionName: authData.record.collectionName,
        created: authData.record.created,
        updated: authData.record.updated,
        ...extractUserFields(authData.record),
      },
    };
  } catch (error: any) {
    throw createAuthError(error, "User authentication failed");
  }
}

/**
 * Logout and clear the authentication store
 *
 * @param pb - PocketBase client instance
 *
 * Requirements: 6.3
 */
export function logout(pb: PocketBase): void {
  pb.authStore.clear();
}

/**
 * Check if the client is currently authenticated
 *
 * @param pb - PocketBase client instance
 * @returns True if authenticated with a valid token
 *
 * Requirements: 6.5
 */
export function isAuthenticated(pb: PocketBase): boolean {
  return pb.authStore.isValid;
}

/**
 * Get the current authenticated user information
 *
 * @param pb - PocketBase client instance
 * @returns User information if authenticated, null otherwise
 *
 * Requirements: 6.5
 */
export function getCurrentUser(pb: PocketBase): AuthStatusResponse["user"] | null {
  if (!pb.authStore.isValid) {
    return null;
  }

  const record = pb.authStore.record;
  if (!record) {
    return null;
  }

  // Check if it's an admin (superuser collection)
  const isAdmin = record.collectionName === SUPERUSERS_COLLECTION;

  return {
    id: record.id,
    email: record.email,
    isAdmin,
    verified: isAdmin ? true : (record as any).verified ?? false,
    ...(isAdmin ? {} : extractUserFields(record as RecordModel)),
  };
}

/**
 * Get the current authentication status
 *
 * @param pb - PocketBase client instance
 * @returns Authentication status with user info and token
 *
 * Requirements: 6.5
 */
export function getAuthStatus(pb: PocketBase): AuthStatusResponse {
  const isAuth = isAuthenticated(pb);
  const user = getCurrentUser(pb);
  const token = isAuth ? pb.authStore.token : null;

  return {
    isAuthenticated: isAuth,
    user,
    token,
  };
}

/**
 * Get the current authentication token
 *
 * @param pb - PocketBase client instance
 * @returns The current token or null if not authenticated
 *
 * Requirements: 1.5, 6.2
 */
export function getToken(pb: PocketBase): string | null {
  if (!pb.authStore.isValid) {
    return null;
  }
  return pb.authStore.token || null;
}

/**
 * Extract user-specific fields from a record, excluding system fields
 */
function extractUserFields(record: RecordModel): Record<string, any> {
  const systemFields = [
    "id",
    "email",
    "verified",
    "collectionId",
    "collectionName",
    "created",
    "updated",
    "emailVisibility",
    "username",
  ];

  const userFields: Record<string, any> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!systemFields.includes(key) && !key.startsWith("_")) {
      userFields[key] = value;
    }
  }

  // Include username if present
  if (record.username) {
    userFields.username = record.username;
  }

  return userFields;
}

/**
 * Create a standardized authentication error
 */
function createAuthError(error: any, defaultMessage: string): Error {
  // Handle PocketBase ClientResponseError
  if (error?.status === 400 || error?.status === 401) {
    const message = error.message || "Invalid credentials";
    const authError = new Error(message);
    (authError as any).code = "AUTH_INVALID";
    (authError as any).status = error.status;
    (authError as any).details = error.data;
    return authError;
  }

  // Handle network errors
  if (error?.message?.includes("fetch") || error?.message?.includes("network")) {
    const networkError = new Error("Unable to connect to PocketBase server");
    (networkError as any).code = "NETWORK_ERROR";
    (networkError as any).originalError = error;
    return networkError;
  }

  // Generic error
  const genericError = new Error(error?.message || defaultMessage);
  (genericError as any).code = "AUTH_ERROR";
  (genericError as any).originalError = error;
  return genericError;
}
