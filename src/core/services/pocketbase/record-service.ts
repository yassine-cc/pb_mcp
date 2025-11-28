/**
 * Record Service for PocketBase
 *
 * Handles CRUD operations on collection records including:
 * - List records with filtering, sorting, and pagination
 * - Get record by id
 * - Create record
 * - Update record
 * - Delete record
 * - Permission-based access control
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5
 */

import PocketBase, { RecordModel, ListResult } from "pocketbase";
import { handleError, ErrorCode } from "./error-handler.js";

/**
 * Query options for listing records
 */
export interface QueryOptions {
  filter?: string;
  sort?: string;
  page?: number;
  perPage?: number;
  expand?: string;
  fields?: string;
  headers?: Record<string, string>;
}

/**
 * Record response with full details
 */
export interface RecordResponse {
  success: true;
  record: {
    id: string;
    collectionId: string;
    collectionName: string;
    created: string;
    updated: string;
    [key: string]: any;
  };
}

/**
 * Record list response with pagination metadata
 */
export interface RecordListResponse {
  success: true;
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  items: Array<{
    id: string;
    collectionId: string;
    collectionName: string;
    created: string;
    updated: string;
    [key: string]: any;
  }>;
}

/**
 * Transform a PocketBase record to our response format
 */
function transformRecord(record: RecordModel): RecordResponse["record"] {
  return {
    id: record.id,
    collectionId: record.collectionId,
    collectionName: record.collectionName,
    created: record.created,
    updated: record.updated,
    ...extractRecordFields(record),
  };
}

/**
 * Extract user-defined fields from a record, excluding system fields
 */
function extractRecordFields(record: RecordModel): Record<string, any> {
  const systemFields = ["id", "collectionId", "collectionName", "created", "updated", "expand"];
  const fields: Record<string, any> = {};

  for (const [key, value] of Object.entries(record)) {
    if (!systemFields.includes(key) && !key.startsWith("_")) {
      fields[key] = value;
    }
  }

  // Include expand if present
  if (record.expand) {
    fields.expand = record.expand;
  }

  return fields;
}

/**
 * List records from a collection with optional filtering, sorting, and pagination
 *
 * @param pb - PocketBase client instance
 * @param collection - Collection name or id
 * @param options - Query options (filter, sort, page, perPage, expand, fields)
 * @returns List of records with pagination metadata
 *
 * Requirements: 4.2, 5.1, 5.2, 5.3, 5.4, 5.5
 */
export async function listRecords(
  pb: PocketBase,
  collection: string,
  options: QueryOptions = {}
): Promise<RecordListResponse> {
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
      items: result.items.map(transformRecord),
    };
  } catch (error) {
    throw handleError(error, `Failed to list records from '${collection}'`);
  }
}

/**
 * Get all records from a collection (no pagination)
 *
 * @param pb - PocketBase client instance
 * @param collection - Collection name or id
 * @param options - Query options (filter, sort, expand, fields)
 * @returns All matching records
 *
 * Requirements: 5.4
 */
export async function getAllRecords(
  pb: PocketBase,
  collection: string,
  options: Omit<QueryOptions, "page" | "perPage"> = {}
): Promise<RecordListResponse> {
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
      items: records.map(transformRecord),
    };
  } catch (error) {
    throw handleError(error, `Failed to get all records from '${collection}'`);
  }
}

/**
 * Get a single record by id
 *
 * @param pb - PocketBase client instance
 * @param collection - Collection name or id
 * @param id - Record id
 * @param options - Query options (expand, fields)
 * @returns Record details
 *
 * Requirements: 4.2
 */
export async function getRecord(
  pb: PocketBase,
  collection: string,
  id: string,
  options: Pick<QueryOptions, "expand" | "fields" | "headers"> = {}
): Promise<RecordResponse> {
  try {
    const queryOptions: Record<string, any> = {};
    if (options.expand) queryOptions.expand = options.expand;
    if (options.fields) queryOptions.fields = options.fields;
    if (options.headers) queryOptions.headers = options.headers;

    const record = await pb.collection(collection).getOne(id, queryOptions);

    return {
      success: true,
      record: transformRecord(record),
    };
  } catch (error) {
    throw handleError(error, `Failed to get record '${id}' from '${collection}'`);
  }
}

/**
 * Options for record creation
 */
export interface CreateRecordOptions {
  headers?: Record<string, string>;
}

/**
 * Create a new record in a collection
 *
 * @param pb - PocketBase client instance
 * @param collection - Collection name or id
 * @param data - Record data
 * @param options - Optional settings including headers
 * @returns Created record with assigned id
 *
 * Requirements: 4.1
 */
export async function createRecord(
  pb: PocketBase,
  collection: string,
  data: Record<string, any>,
  options: CreateRecordOptions = {}
): Promise<RecordResponse> {
  try {
    const createOptions: Record<string, any> = {};
    if (options.headers) createOptions.headers = options.headers;

    const record = await pb.collection(collection).create(data, createOptions);

    return {
      success: true,
      record: transformRecord(record),
    };
  } catch (error) {
    throw handleError(error, `Failed to create record in '${collection}'`);
  }
}

/**
 * Options for record update
 */
export interface UpdateRecordOptions {
  headers?: Record<string, string>;
}

/**
 * Update an existing record
 *
 * @param pb - PocketBase client instance
 * @param collection - Collection name or id
 * @param id - Record id
 * @param data - Updated record data
 * @param options - Optional settings including headers
 * @returns Updated record
 *
 * Requirements: 4.3
 */
export async function updateRecord(
  pb: PocketBase,
  collection: string,
  id: string,
  data: Record<string, any>,
  options: UpdateRecordOptions = {}
): Promise<RecordResponse> {
  try {
    const updateOptions: Record<string, any> = {};
    if (options.headers) updateOptions.headers = options.headers;

    const record = await pb.collection(collection).update(id, data, updateOptions);

    return {
      success: true,
      record: transformRecord(record),
    };
  } catch (error) {
    throw handleError(error, `Failed to update record '${id}' in '${collection}'`);
  }
}

/**
 * Options for record deletion
 */
export interface DeleteRecordOptions {
  headers?: Record<string, string>;
}

/**
 * Delete a record from a collection
 *
 * @param pb - PocketBase client instance
 * @param collection - Collection name or id
 * @param id - Record id
 * @param options - Optional settings including headers
 * @returns Success status
 *
 * Requirements: 4.4
 */
export async function deleteRecord(
  pb: PocketBase,
  collection: string,
  id: string,
  options: DeleteRecordOptions = {}
): Promise<{ success: true }> {
  try {
    const deleteOptions: Record<string, any> = {};
    if (options.headers) deleteOptions.headers = options.headers;

    await pb.collection(collection).delete(id, deleteOptions);

    return {
      success: true,
    };
  } catch (error) {
    throw handleError(error, `Failed to delete record '${id}' from '${collection}'`);
  }
}

/**
 * Get the first record matching a filter
 *
 * @param pb - PocketBase client instance
 * @param collection - Collection name or id
 * @param filter - Filter expression
 * @param options - Query options (expand, fields)
 * @returns First matching record or null
 *
 * Requirements: 4.2, 5.1
 */
export async function getFirstRecord(
  pb: PocketBase,
  collection: string,
  filter: string,
  options: Pick<QueryOptions, "expand" | "fields"> = {}
): Promise<RecordResponse | null> {
  try {
    const queryOptions: Record<string, any> = { filter };
    if (options.expand) queryOptions.expand = options.expand;
    if (options.fields) queryOptions.fields = options.fields;

    const record = await pb.collection(collection).getFirstListItem(filter, queryOptions);

    return {
      success: true,
      record: transformRecord(record),
    };
  } catch (error: any) {
    // Return null if not found instead of throwing
    if (error?.status === 404) {
      return null;
    }
    throw handleError(error, `Failed to find record in '${collection}'`);
  }
}
