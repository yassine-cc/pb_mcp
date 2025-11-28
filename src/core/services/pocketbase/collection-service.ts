/**
 * Collection Service for PocketBase
 *
 * Handles collection management operations including:
 * - List collections functionality
 * - Get collection by name/id
 * - Create collection with schema validation
 * - Update collection schema
 * - Delete collection
 * - Admin permission checks
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4
 */

import PocketBase, { CollectionModel } from "pocketbase";
import { handleError, ErrorCode, createValidationError, FieldValidationError } from "./error-handler.js";

/**
 * Schema field definition for collection creation/update
 */
export interface SchemaField {
  id?: string;
  name: string;
  type: string;
  required: boolean;
  options?: Record<string, any>;
}

/**
 * Collection schema for creation
 */
export interface CollectionSchema {
  name: string;
  type: "base" | "auth" | "view";
  schema: SchemaField[];
  listRule?: string | null;
  viewRule?: string | null;
  createRule?: string | null;
  updateRule?: string | null;
  deleteRule?: string | null;
  options?: Record<string, any>;
}

/**
 * Collection response with full details
 */
export interface CollectionResponse {
  success: true;
  collection: {
    id: string;
    name: string;
    type: string;
    schema: SchemaField[];
    listRule: string | null;
    viewRule: string | null;
    createRule: string | null;
    updateRule: string | null;
    deleteRule: string | null;
    created: string;
    updated: string;
    options?: Record<string, any>;
  };
}

/**
 * Collection list response
 */
export interface CollectionListResponse {
  success: true;
  collections: Array<{
    id: string;
    name: string;
    type: string;
    created: string;
    updated: string;
  }>;
}

/**
 * Valid PocketBase field types
 */
const VALID_FIELD_TYPES = [
  "text",
  "number",
  "bool",
  "email",
  "url",
  "date",
  "select",
  "file",
  "relation",
  "json",
  "editor",
  "autodate",
];

/**
 * Reserved collection names that cannot be used
 */
const RESERVED_COLLECTION_NAMES = ["_superusers", "_authOrigins", "_externalAuths", "_mfas", "_otps"];

/**
 * Validate a collection name
 *
 * @param name - The collection name to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateCollectionName(name: string): FieldValidationError[] {
  const errors: FieldValidationError[] = [];

  if (!name || typeof name !== "string") {
    errors.push({
      field: "name",
      code: "required",
      message: "Collection name is required",
    });
    return errors;
  }

  if (name.length < 3) {
    errors.push({
      field: "name",
      code: "min_length",
      message: "Collection name must be at least 3 characters",
    });
  }

  if (name.length > 100) {
    errors.push({
      field: "name",
      code: "max_length",
      message: "Collection name must be at most 100 characters",
    });
  }

  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
    errors.push({
      field: "name",
      code: "invalid_format",
      message: "Collection name must start with a letter and contain only letters, numbers, and underscores",
    });
  }

  if (RESERVED_COLLECTION_NAMES.includes(name)) {
    errors.push({
      field: "name",
      code: "reserved",
      message: `Collection name '${name}' is reserved`,
    });
  }

  return errors;
}

/**
 * Validate a schema field
 *
 * @param field - The field to validate
 * @param index - The field index for error reporting
 * @returns Array of validation errors (empty if valid)
 */
export function validateSchemaField(field: SchemaField, index: number): FieldValidationError[] {
  const errors: FieldValidationError[] = [];
  const fieldPrefix = `schema[${index}]`;

  if (!field.name || typeof field.name !== "string") {
    errors.push({
      field: `${fieldPrefix}.name`,
      code: "required",
      message: `Field name is required at index ${index}`,
    });
  } else if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(field.name)) {
    errors.push({
      field: `${fieldPrefix}.name`,
      code: "invalid_format",
      message: `Field name '${field.name}' must start with a letter and contain only letters, numbers, and underscores`,
    });
  }

  if (!field.type || typeof field.type !== "string") {
    errors.push({
      field: `${fieldPrefix}.type`,
      code: "required",
      message: `Field type is required at index ${index}`,
    });
  } else if (!VALID_FIELD_TYPES.includes(field.type)) {
    errors.push({
      field: `${fieldPrefix}.type`,
      code: "invalid_type",
      message: `Invalid field type '${field.type}'. Valid types: ${VALID_FIELD_TYPES.join(", ")}`,
    });
  }

  if (typeof field.required !== "boolean") {
    errors.push({
      field: `${fieldPrefix}.required`,
      code: "invalid_type",
      message: `Field 'required' must be a boolean at index ${index}`,
    });
  }

  return errors;
}

/**
 * Validate a collection schema
 *
 * @param schema - The schema to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateCollectionSchema(schema: CollectionSchema): FieldValidationError[] {
  const errors: FieldValidationError[] = [];

  // Validate name
  errors.push(...validateCollectionName(schema.name));

  // Validate type
  if (!schema.type || !["base", "auth", "view"].includes(schema.type)) {
    errors.push({
      field: "type",
      code: "invalid_type",
      message: "Collection type must be 'base', 'auth', or 'view'",
    });
  }

  // For view collections, schema is auto-generated from SQL query
  // so we skip schema validation and require options.query instead
  if (schema.type === "view") {
    if (!schema.options?.query) {
      errors.push({
        field: "options.query",
        code: "required",
        message: "View collections require options.query with a SQL SELECT statement",
      });
    }
    return errors;
  }

  // Validate schema fields for non-view collections
  if (!schema.schema || !Array.isArray(schema.schema)) {
    errors.push({
      field: "schema",
      code: "required",
      message: "Schema fields array is required",
    });
  } else {
    // Check for duplicate field names
    const fieldNames = new Set<string>();
    schema.schema.forEach((field, index) => {
      errors.push(...validateSchemaField(field, index));

      if (field.name) {
        if (fieldNames.has(field.name)) {
          errors.push({
            field: `schema[${index}].name`,
            code: "duplicate",
            message: `Duplicate field name '${field.name}'`,
          });
        }
        fieldNames.add(field.name);
      }
    });
  }

  return errors;
}

/**
 * Check if the client is authenticated as admin
 *
 * @param pb - PocketBase client instance
 * @returns True if authenticated as admin
 */
export function isAdminAuthenticated(pb: PocketBase): boolean {
  // Check if there's a valid token
  if (!pb.authStore.token) {
    return false;
  }

  const record = pb.authStore.record;

  // If we have a record, check if it's a superuser
  if (record) {
    // Check collectionName or isAdmin flag (set by our auth service)
    return record.collectionName === "_superusers" || (record as any).isAdmin === true;
  }

  // If we have a token but no record, assume it's an admin token
  // (this happens when token is set directly via adminToken parameter)
  // The actual permission check will happen on the PocketBase server
  return pb.authStore.token.length > 0;
}

/**
 * Transform a PocketBase collection model to our response format
 */
function transformCollection(collection: CollectionModel): CollectionResponse["collection"] {
  return {
    id: collection.id,
    name: collection.name,
    type: collection.type,
    schema: (collection.fields || []).map((field: any) => ({
      id: field.id,
      name: field.name,
      type: field.type,
      required: field.required || false,
      options: field.options,
    })),
    listRule: collection.listRule ?? null,
    viewRule: collection.viewRule ?? null,
    createRule: collection.createRule ?? null,
    updateRule: collection.updateRule ?? null,
    deleteRule: collection.deleteRule ?? null,
    created: collection.created,
    updated: collection.updated,
    options: (collection as any).options,
  };
}

/**
 * Transform a collection to list item format
 */
function transformCollectionListItem(collection: CollectionModel): CollectionListResponse["collections"][0] {
  return {
    id: collection.id,
    name: collection.name,
    type: collection.type,
    created: collection.created,
    updated: collection.updated,
  };
}

/**
 * List all collections
 *
 * @param pb - PocketBase client instance
 * @returns List of collections with basic metadata
 *
 * Requirements: 3.1
 */
export async function listCollections(pb: PocketBase): Promise<CollectionListResponse> {
  try {
    const collections = await pb.collections.getFullList();

    return {
      success: true,
      collections: collections.map(transformCollectionListItem),
    };
  } catch (error) {
    throw handleError(error, "Failed to list collections");
  }
}

/**
 * Get a collection by name or id
 *
 * @param pb - PocketBase client instance
 * @param idOrName - Collection id or name
 * @returns Collection details with full schema
 *
 * Requirements: 3.2, 3.3, 3.4
 */
export async function getCollection(pb: PocketBase, idOrName: string): Promise<CollectionResponse> {
  try {
    const collection = await pb.collections.getOne(idOrName);

    return {
      success: true,
      collection: transformCollection(collection),
    };
  } catch (error) {
    throw handleError(error, `Failed to get collection '${idOrName}'`);
  }
}

/**
 * Create a new collection
 *
 * @param pb - PocketBase client instance (must be admin authenticated)
 * @param schema - Collection schema definition
 * @returns Created collection details
 *
 * Requirements: 2.1, 2.4, 2.5
 */
export async function createCollection(pb: PocketBase, schema: CollectionSchema): Promise<CollectionResponse> {
  // Validate admin authentication
  if (!isAdminAuthenticated(pb)) {
    const error = new Error("Admin authentication required for collection management");
    (error as any).code = ErrorCode.FORBIDDEN;
    (error as any).status = 403;
    throw error;
  }

  // Validate schema before sending to PocketBase
  const validationErrors = validateCollectionSchema(schema);
  if (validationErrors.length > 0) {
    throw createValidationError(validationErrors, "Invalid collection schema");
  }

  try {
    // Transform schema fields to PocketBase format
    const pbSchema = schema.schema.map((field) => ({
      name: field.name,
      type: field.type,
      required: field.required,
      options: field.options || {},
    }));

    const collectionData: any = {
      name: schema.name,
      type: schema.type,
      listRule: schema.listRule ?? null,
      viewRule: schema.viewRule ?? null,
    };

    // For view collections, use viewQuery instead of fields
    if (schema.type === "view") {
      collectionData.viewQuery = schema.options?.query || "";
    } else {
      collectionData.fields = pbSchema;
      collectionData.createRule = schema.createRule ?? null;
      collectionData.updateRule = schema.updateRule ?? null;
      collectionData.deleteRule = schema.deleteRule ?? null;
    }

    if (schema.options && schema.type !== "view") {
      collectionData.options = schema.options;
    }

    const collection = await pb.collections.create(collectionData);

    return {
      success: true,
      collection: transformCollection(collection),
    };
  } catch (error) {
    throw handleError(error, `Failed to create collection '${schema.name}'`);
  }
}

/**
 * Update an existing collection
 *
 * @param pb - PocketBase client instance (must be admin authenticated)
 * @param idOrName - Collection id or name
 * @param schema - Partial collection schema with updates
 * @returns Updated collection details
 *
 * Requirements: 2.2, 2.4, 2.5
 */
export async function updateCollection(
  pb: PocketBase,
  idOrName: string,
  schema: Partial<CollectionSchema>
): Promise<CollectionResponse> {
  // Validate admin authentication
  if (!isAdminAuthenticated(pb)) {
    const error = new Error("Admin authentication required for collection management");
    (error as any).code = ErrorCode.FORBIDDEN;
    (error as any).status = 403;
    throw error;
  }

  // Validate schema fields if provided
  const validationErrors: FieldValidationError[] = [];

  if (schema.name !== undefined) {
    validationErrors.push(...validateCollectionName(schema.name));
  }

  if (schema.type !== undefined && !["base", "auth", "view"].includes(schema.type)) {
    validationErrors.push({
      field: "type",
      code: "invalid_type",
      message: "Collection type must be 'base', 'auth', or 'view'",
    });
  }

  if (schema.schema !== undefined) {
    if (!Array.isArray(schema.schema)) {
      validationErrors.push({
        field: "schema",
        code: "invalid_type",
        message: "Schema must be an array",
      });
    } else {
      const fieldNames = new Set<string>();
      schema.schema.forEach((field, index) => {
        validationErrors.push(...validateSchemaField(field, index));
        if (field.name) {
          if (fieldNames.has(field.name)) {
            validationErrors.push({
              field: `schema[${index}].name`,
              code: "duplicate",
              message: `Duplicate field name '${field.name}'`,
            });
          }
          fieldNames.add(field.name);
        }
      });
    }
  }

  if (validationErrors.length > 0) {
    throw createValidationError(validationErrors, "Invalid collection schema update");
  }

  try {
    const updateData: any = {};

    if (schema.name !== undefined) {
      updateData.name = schema.name;
    }

    if (schema.type !== undefined) {
      updateData.type = schema.type;
    }

    if (schema.schema !== undefined) {
      updateData.fields = schema.schema.map((field) => ({
        name: field.name,
        type: field.type,
        required: field.required,
        options: field.options || {},
      }));
    }

    if (schema.listRule !== undefined) {
      updateData.listRule = schema.listRule;
    }

    if (schema.viewRule !== undefined) {
      updateData.viewRule = schema.viewRule;
    }

    if (schema.createRule !== undefined) {
      updateData.createRule = schema.createRule;
    }

    if (schema.updateRule !== undefined) {
      updateData.updateRule = schema.updateRule;
    }

    if (schema.deleteRule !== undefined) {
      updateData.deleteRule = schema.deleteRule;
    }

    if (schema.options !== undefined) {
      updateData.options = schema.options;
    }

    const collection = await pb.collections.update(idOrName, updateData);

    return {
      success: true,
      collection: transformCollection(collection),
    };
  } catch (error) {
    throw handleError(error, `Failed to update collection '${idOrName}'`);
  }
}

/**
 * Delete a collection
 *
 * @param pb - PocketBase client instance (must be admin authenticated)
 * @param idOrName - Collection id or name
 * @returns Success status
 *
 * Requirements: 2.3, 2.4
 */
export async function deleteCollection(pb: PocketBase, idOrName: string): Promise<{ success: true }> {
  // Validate admin authentication
  if (!isAdminAuthenticated(pb)) {
    const error = new Error("Admin authentication required for collection management");
    (error as any).code = ErrorCode.FORBIDDEN;
    (error as any).status = 403;
    throw error;
  }

  try {
    await pb.collections.delete(idOrName);

    return {
      success: true,
    };
  } catch (error) {
    throw handleError(error, `Failed to delete collection '${idOrName}'`);
  }
}
