/**
 * User Service for PocketBase
 *
 * Handles user management operations including:
 * - List users with filtering
 * - Get user by id
 * - Create user
 * - Update user
 * - Delete user
 * - Admin permission checks
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import PocketBase, { RecordModel, ListResult } from "pocketbase";
import { handleError, ErrorCode } from "./error-handler.js";

/**
 * Query options for listing users
 */
export interface UserQueryOptions {
  filter?: string;
  sort?: string;
  page?: number;
  perPage?: number;
  expand?: string;
  fields?: string;
  headers?: Record<string, string>;
}

/**
 * User data for creation
 */
export interface UserCreateData {
  email: string;
  password: string;
  passwordConfirm: string;
  emailVisibility?: boolean;
  verified?: boolean;
  name?: string;
  [key: string]: any;
}

/**
 * User data for updates
 */
export interface UserUpdateData {
  email?: string;
  password?: string;
  passwordConfirm?: string;
  oldPassword?: string;
  emailVisibility?: boolean;
  verified?: boolean;
  name?: string;
  [key: string]: any;
}

/**
 * User response with full details
 */
export interface UserResponse {
  success: true;
  user: {
    id: string;
    collectionId: string;
    collectionName: string;
    email: string;
    emailVisibility: boolean;
    verified: boolean;
    created: string;
    updated: string;
    [key: string]: any;
  };
}

/**
 * User list response with pagination metadata
 */
export interface UserListResponse {
  success: true;
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  items: Array<{
    id: string;
    collectionId: string;
    collectionName: string;
    email: string;
    emailVisibility: boolean;
    verified: boolean;
    created: string;
    updated: string;
    [key: string]: any;
  }>;
}

/**
 * Transform a PocketBase user record to our response format
 */
function transformUser(record: RecordModel): UserResponse["user"] {
  const systemFields = [
    "id",
    "collectionId",
    "collectionName",
    "email",
    "emailVisibility",
    "verified",
    "created",
    "updated",
    "expand",
  ];
  const customFields: Record<string, any> = {};

  for (const [key, value] of Object.entries(record)) {
    if (!systemFields.includes(key) && !key.startsWith("_")) {
      customFields[key] = value;
    }
  }

  return {
    id: record.id,
    collectionId: record.collectionId,
    collectionName: record.collectionName,
    email: record.email || "",
    emailVisibility: record.emailVisibility ?? false,
    verified: record.verified ?? false,
    created: record.created,
    updated: record.updated,
    ...customFields,
  };
}

/**
 * List users from an auth collection with optional filtering, sorting, and pagination
 * Note: Permissions are enforced by PocketBase collection rules
 *
 * @param pb - PocketBase client instance
 * @param collection - Auth collection name (default: "users")
 * @param options - Query options (filter, sort, page, perPage, expand, fields)
 * @returns List of users with pagination metadata
 *
 * Requirements: 7.4, 7.5
 */
export async function listUsers(
  pb: PocketBase,
  collection: string = "users",
  options: UserQueryOptions = {}
): Promise<UserListResponse> {
  try {
    const { page = 1, perPage = 30, filter, sort, expand, fields } = options;

    const queryOptions: Record<string, any> = {};
    if (filter) queryOptions.filter = filter;
    if (sort) queryOptions.sort = sort;
    if (expand) queryOptions.expand = expand;
    if (fields) queryOptions.fields = fields;
    if (options.headers) queryOptions.headers = options.headers;

    const result: ListResult<RecordModel> = await pb.collection(collection).getList(page, perPage, queryOptions);

    return {
      success: true,
      page: result.page,
      perPage: result.perPage,
      totalItems: result.totalItems,
      totalPages: result.totalPages,
      items: result.items.map(transformUser),
    };
  } catch (error) {
    throw handleError(error, `Failed to list users from '${collection}'`);
  }
}

/**
 * Get a single user by id
 *
 * @param pb - PocketBase client instance (must be admin authenticated)
 * @param collection - Auth collection name (default: "users")
 * @param id - User id
 * @param options - Query options (expand, fields)
 * @returns User details
 *
 * Requirements: 7.4, 7.5
 */
export async function getUser(
  pb: PocketBase,
  collection: string = "users",
  id: string,
  options: Pick<UserQueryOptions, "expand" | "fields" | "headers"> = {}
): Promise<UserResponse> {
  try {
    const queryOptions: Record<string, any> = {};
    if (options.expand) queryOptions.expand = options.expand;
    if (options.fields) queryOptions.fields = options.fields;
    if (options.headers) queryOptions.headers = options.headers;

    const record = await pb.collection(collection).getOne(id, queryOptions);

    return {
      success: true,
      user: transformUser(record),
    };
  } catch (error) {
    throw handleError(error, `Failed to get user '${id}' from '${collection}'`);
  }
}

/**
 * Create a new user in an auth collection
 *
 * @param pb - PocketBase client instance (must be admin authenticated)
 * @param collection - Auth collection name (default: "users")
 * @param data - User data including email, password, passwordConfirm
 * @returns Created user with assigned id
 *
 * Requirements: 7.1, 7.5
 */
export interface CreateUserOptions {
  headers?: Record<string, string>;
}

export async function createUser(
  pb: PocketBase,
  collection: string = "users",
  data: UserCreateData,
  options: CreateUserOptions = {}
): Promise<UserResponse> {
  try {
    const createOptions: Record<string, any> = {};
    if (options.headers) createOptions.headers = options.headers;

    const record = await pb.collection(collection).create(data, createOptions);

    return {
      success: true,
      user: transformUser(record),
    };
  } catch (error) {
    throw handleError(error, `Failed to create user in '${collection}'`);
  }
}

/**
 * Update an existing user
 *
 * @param pb - PocketBase client instance (must be admin authenticated)
 * @param collection - Auth collection name (default: "users")
 * @param id - User id
 * @param data - Updated user data
 * @returns Updated user
 *
 * Requirements: 7.2, 7.5
 */
export interface UpdateUserOptions {
  headers?: Record<string, string>;
}

export async function updateUser(
  pb: PocketBase,
  collection: string = "users",
  id: string,
  data: UserUpdateData,
  options: UpdateUserOptions = {}
): Promise<UserResponse> {
  try {
    const updateOptions: Record<string, any> = {};
    if (options.headers) updateOptions.headers = options.headers;

    const record = await pb.collection(collection).update(id, data, updateOptions);

    return {
      success: true,
      user: transformUser(record),
    };
  } catch (error) {
    throw handleError(error, `Failed to update user '${id}' in '${collection}'`);
  }
}

/**
 * Delete a user from an auth collection
 *
 * @param pb - PocketBase client instance (must be admin authenticated)
 * @param collection - Auth collection name (default: "users")
 * @param id - User id
 * @returns Success status
 *
 * Requirements: 7.3, 7.5
 */
export interface DeleteUserOptions {
  headers?: Record<string, string>;
}

export async function deleteUser(
  pb: PocketBase,
  collection: string = "users",
  id: string,
  options: DeleteUserOptions = {}
): Promise<{ success: true }> {
  try {
    const deleteOptions: Record<string, any> = {};
    if (options.headers) deleteOptions.headers = options.headers;

    await pb.collection(collection).delete(id, deleteOptions);

    return {
      success: true,
    };
  } catch (error) {
    throw handleError(error, `Failed to delete user '${id}' from '${collection}'`);
  }
}

/**
 * Get all users from an auth collection (no pagination)
 *
 * @param pb - PocketBase client instance (must be admin authenticated)
 * @param collection - Auth collection name (default: "users")
 * @param options - Query options (filter, sort, expand, fields)
 * @returns All matching users
 *
 * Requirements: 7.4, 7.5
 */
export async function getAllUsers(
  pb: PocketBase,
  collection: string = "users",
  options: Omit<UserQueryOptions, "page" | "perPage"> = {}
): Promise<UserListResponse> {
  try {
    const { filter, sort, expand, fields } = options;

    const queryOptions: Record<string, any> = {};
    if (filter) queryOptions.filter = filter;
    if (sort) queryOptions.sort = sort;
    if (expand) queryOptions.expand = expand;
    if (fields) queryOptions.fields = fields;

    const records = await pb.collection(collection).getFullList(queryOptions);

    return {
      success: true,
      page: 1,
      perPage: records.length,
      totalItems: records.length,
      totalPages: 1,
      items: records.map(transformUser),
    };
  } catch (error) {
    throw handleError(error, `Failed to get all users from '${collection}'`);
  }
}
