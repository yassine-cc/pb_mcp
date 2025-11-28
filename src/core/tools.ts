import { FastMCP } from "fastmcp";
import { z } from "zod";
import PocketBase from "pocketbase";
import {
  createClient,
  getPocketBaseUrl,
  authenticateAdmin,
  authenticateUser,
  logout,
  getAuthStatus,
  isAuthenticated,
  listCollections,
  getCollection,
  createCollection,
  updateCollection,
  deleteCollection,
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
} from "./services/pocketbase/index.js";
import { handleError } from "./services/pocketbase/error-handler.js";
import { formatOutput } from "./services/output-formatter.js";

// Store for maintaining authentication state across tool calls
// Each baseUrl gets its own PocketBase client instance
const clientStore: Map<string, PocketBase> = new Map();

// Utility function to get PocketBase client with admin token
// Uses clientStore if available (after authenticate_admin/authenticate_user)
function getPocketBaseClient(adminToken?: string, baseUrl?: string) {
  // Use getPocketBaseUrl for consistent URL resolution
  const url = getPocketBaseUrl(baseUrl);

  console.error(`[getPocketBaseClient] URL: ${url}, adminToken provided: ${!!adminToken}`);
  console.error(`[getPocketBaseClient] clientStore keys: ${JSON.stringify([...clientStore.keys()])}`);

  // If explicit token provided, create new client with that token
  if (adminToken) {
    console.error(`[getPocketBaseClient] Using explicit adminToken`);
    const pb = new PocketBase(url);
    pb.authStore.save(adminToken, null);
    return pb;
  }

  // Check if we have an authenticated client in the store
  if (clientStore.has(url)) {
    const storedClient = clientStore.get(url)!;
    console.error(
      `[getPocketBaseClient] Found client in store, isValid: ${
        storedClient.authStore.isValid
      }, token: ${storedClient.authStore.token?.substring(0, 20)}...`
    );
    if (storedClient.authStore.isValid) {
      return storedClient;
    }
  } else {
    console.error(`[getPocketBaseClient] No client in store for URL: ${url}`);
  }

  // Fall back to env token
  const token = process.env.POCKETBASE_ADMIN_TOKEN;
  if (!token) {
    throw new Error(
      "PocketBase admin token is required. Provide it as parameter, authenticate first, or set POCKETBASE_ADMIN_TOKEN environment variable."
    );
  }

  console.error(`[getPocketBaseClient] Using env token`);
  const pb = new PocketBase(url);
  pb.authStore.save(token, null);
  return pb;
}

/**
 * Get or create a PocketBase client for the given baseUrl
 * This allows maintaining authentication state across multiple tool calls
 */
function getOrCreateClient(baseUrl?: string): PocketBase {
  const url = getPocketBaseUrl(baseUrl);

  if (!clientStore.has(url)) {
    clientStore.set(url, createClient({ baseUrl: url }));
  }

  return clientStore.get(url)!;
}

/**
 * Register all tools with the MCP server
 *
 * @param server The FastMCP server instance
 */
export function registerTools(server: FastMCP) {
  // ============================================
  // Collection Management Tools
  // Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4
  // ============================================

  // PocketBase: Get collections list
  server.addTool({
    name: "list_collections",
    description:
      "Get the list of all collections from PocketBase. Returns collection names, types, and basic metadata including created/updated timestamps.",
    parameters: z.object({
      adminToken: z.string().optional().describe("PocketBase admin token (or use POCKETBASE_ADMIN_TOKEN env var)"),
      baseUrl: z
        .string()
        .optional()
        .describe("PocketBase base URL (or use POCKETBASE_URL env var, default: http://127.0.0.1:8090)"),
    }),
    execute: async (params) => {
      try {
        const pb = getPocketBaseClient(params.adminToken, params.baseUrl);
        const result = await listCollections(pb);
        return formatOutput(result);
      } catch (error) {
        const errorResponse = handleError(error);
        return formatOutput(errorResponse);
      }
    },
  });

  // PocketBase: Get specific collection details
  server.addTool({
    name: "get_collection",
    description:
      "Get detailed information about a specific collection from PocketBase. Returns complete schema including field definitions, types, constraints, and access rules (listRule, viewRule, createRule, updateRule, deleteRule).",
    parameters: z.object({
      collectionName: z.string().describe("Name or ID of the collection to retrieve"),
      adminToken: z.string().optional().describe("PocketBase admin token (or use POCKETBASE_ADMIN_TOKEN env var)"),
      baseUrl: z
        .string()
        .optional()
        .describe("PocketBase base URL (or use POCKETBASE_URL env var, default: http://127.0.0.1:8090)"),
    }),
    execute: async (params) => {
      try {
        const pb = getPocketBaseClient(params.adminToken, params.baseUrl);
        const result = await getCollection(pb, params.collectionName);
        return formatOutput(result);
      } catch (error) {
        const errorResponse = handleError(error);
        return formatOutput(errorResponse);
      }
    },
  });

  // PocketBase: Create collection
  server.addTool({
    name: "create_collection",
    description:
      "Create a new collection in PocketBase. Requires admin authentication. Validates schema structure before creation.",
    parameters: z.object({
      name: z
        .string()
        .min(3)
        .max(100)
        .describe("Collection name (must start with a letter, contain only letters, numbers, and underscores)"),
      type: z
        .enum(["base", "auth", "view"])
        .describe("Collection type: 'base' for regular data, 'auth' for user authentication, 'view' for SQL views"),
      schema: z
        .array(
          z.object({
            name: z.string().describe("Field name"),
            type: z
              .string()
              .describe(
                "Field type: text, number, bool, email, url, date, select, file, relation, json, editor, autodate"
              ),
            required: z.boolean().describe("Whether the field is required"),
            options: z.record(z.any()).optional().describe("Field-specific options"),
          })
        )
        .describe("Array of schema field definitions"),
      listRule: z.string().nullable().optional().describe("Rule for listing records (null = admin only, '' = public)"),
      viewRule: z.string().nullable().optional().describe("Rule for viewing records"),
      createRule: z.string().nullable().optional().describe("Rule for creating records"),
      updateRule: z.string().nullable().optional().describe("Rule for updating records"),
      deleteRule: z.string().nullable().optional().describe("Rule for deleting records"),
      options: z.record(z.any()).optional().describe("Additional collection options"),
      adminToken: z.string().optional().describe("PocketBase admin token (or use POCKETBASE_ADMIN_TOKEN env var)"),
      baseUrl: z
        .string()
        .optional()
        .describe("PocketBase base URL (or use POCKETBASE_URL env var, default: http://127.0.0.1:8090)"),
    }),
    execute: async (params) => {
      try {
        const pb = getPocketBaseClient(params.adminToken, params.baseUrl);
        const result = await createCollection(pb, {
          name: params.name,
          type: params.type,
          schema: params.schema,
          listRule: params.listRule,
          viewRule: params.viewRule,
          createRule: params.createRule,
          updateRule: params.updateRule,
          deleteRule: params.deleteRule,
          options: params.options,
        });
        return formatOutput(result);
      } catch (error) {
        const errorResponse = handleError(error);
        return formatOutput(errorResponse);
      }
    },
  });

  // PocketBase: Update collection
  server.addTool({
    name: "update_collection",
    description:
      "Update an existing collection in PocketBase. Requires admin authentication. Only provided fields will be updated.",
    parameters: z.object({
      collectionName: z.string().describe("Name or ID of the collection to update"),
      name: z.string().min(3).max(100).optional().describe("New collection name"),
      type: z.enum(["base", "auth", "view"]).optional().describe("New collection type"),
      schema: z
        .array(
          z.object({
            name: z.string().describe("Field name"),
            type: z.string().describe("Field type"),
            required: z.boolean().describe("Whether the field is required"),
            options: z.record(z.any()).optional().describe("Field-specific options"),
          })
        )
        .optional()
        .describe("New schema field definitions (replaces existing schema)"),
      listRule: z.string().nullable().optional().describe("Rule for listing records"),
      viewRule: z.string().nullable().optional().describe("Rule for viewing records"),
      createRule: z.string().nullable().optional().describe("Rule for creating records"),
      updateRule: z.string().nullable().optional().describe("Rule for updating records"),
      deleteRule: z.string().nullable().optional().describe("Rule for deleting records"),
      options: z.record(z.any()).optional().describe("Additional collection options"),
      adminToken: z.string().optional().describe("PocketBase admin token (or use POCKETBASE_ADMIN_TOKEN env var)"),
      baseUrl: z
        .string()
        .optional()
        .describe("PocketBase base URL (or use POCKETBASE_URL env var, default: http://127.0.0.1:8090)"),
    }),
    execute: async (params) => {
      try {
        const pb = getPocketBaseClient(params.adminToken, params.baseUrl);
        const updateData: any = {};

        if (params.name !== undefined) updateData.name = params.name;
        if (params.type !== undefined) updateData.type = params.type;
        if (params.schema !== undefined) {
          // Cast schema to the expected type - Zod validation ensures the structure is correct
          updateData.schema = params.schema as Array<{
            name: string;
            type: string;
            required: boolean;
            options?: Record<string, any>;
          }>;
        }
        if (params.listRule !== undefined) updateData.listRule = params.listRule;
        if (params.viewRule !== undefined) updateData.viewRule = params.viewRule;
        if (params.createRule !== undefined) updateData.createRule = params.createRule;
        if (params.updateRule !== undefined) updateData.updateRule = params.updateRule;
        if (params.deleteRule !== undefined) updateData.deleteRule = params.deleteRule;
        if (params.options !== undefined) updateData.options = params.options;

        const result = await updateCollection(pb, params.collectionName, updateData);
        return formatOutput(result);
      } catch (error) {
        const errorResponse = handleError(error);
        return formatOutput(errorResponse);
      }
    },
  });

  // PocketBase: Delete collection
  server.addTool({
    name: "delete_collection",
    description:
      "Delete a collection from PocketBase. Requires admin authentication. This will permanently remove the collection and all its records.",
    parameters: z.object({
      collectionName: z.string().describe("Name or ID of the collection to delete"),
      adminToken: z.string().optional().describe("PocketBase admin token (or use POCKETBASE_ADMIN_TOKEN env var)"),
      baseUrl: z
        .string()
        .optional()
        .describe("PocketBase base URL (or use POCKETBASE_URL env var, default: http://127.0.0.1:8090)"),
    }),
    execute: async (params) => {
      try {
        const pb = getPocketBaseClient(params.adminToken, params.baseUrl);
        const result = await deleteCollection(pb, params.collectionName);
        return formatOutput({
          ...result,
          message: `Collection '${params.collectionName}' has been deleted`,
        });
      } catch (error) {
        const errorResponse = handleError(error);
        return formatOutput(errorResponse);
      }
    },
  });

  // ============================================
  // Authentication Tools
  // Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 6.3, 6.5
  // ============================================

  // PocketBase: Authenticate as admin
  server.addTool({
    name: "authenticate_admin",
    description:
      "Authenticate with PocketBase as an admin user. Admin credentials provide full access to all collections, users, and settings.",
    parameters: z.object({
      email: z.string().email().describe("Admin email address"),
      password: z.string().min(1).describe("Admin password"),
      baseUrl: z
        .string()
        .optional()
        .describe("PocketBase base URL (or use POCKETBASE_URL env var, default: http://127.0.0.1:8090)"),
      saveSession: z
        .boolean()
        .default(true)
        .describe(
          "Whether to save the session for subsequent requests (default: true). Set to false to get token without replacing current session."
        ),
    }),
    execute: async (params) => {
      try {
        const result = await authenticateAdmin({ email: params.email, password: params.password }, params.baseUrl);

        // Store the authenticated client for subsequent operations (if saveSession is true)
        if (params.saveSession !== false) {
          const url = getPocketBaseUrl(params.baseUrl);
          console.error(`[authenticate_admin] Saving session for URL: ${url}`);
          const pb = createClient({ baseUrl: url });
          pb.authStore.save(result.token, result.user as any);
          clientStore.set(url, pb);
          console.error(`[authenticate_admin] clientStore keys: ${JSON.stringify([...clientStore.keys()])}`);
        }

        return formatOutput({
          success: true,
          message:
            params.saveSession !== false
              ? "Successfully authenticated as admin (session saved)"
              : "Successfully authenticated as admin (session not saved)",
          token: result.token,
          user: result.user,
          sessionSaved: params.saveSession !== false,
        });
      } catch (error) {
        const errorResponse = handleError(error);
        return formatOutput(errorResponse);
      }
    },
  });

  // PocketBase: Authenticate as user
  server.addTool({
    name: "authenticate_user",
    description:
      "Authenticate with PocketBase as a regular user. User permissions are determined by collection access rules.",
    parameters: z.object({
      email: z.string().email().describe("User email address"),
      password: z.string().min(1).describe("User password"),
      collection: z.string().default("users").describe("Auth collection name (default: 'users')"),
      baseUrl: z
        .string()
        .optional()
        .describe("PocketBase base URL (or use POCKETBASE_URL env var, default: http://127.0.0.1:8090)"),
      saveSession: z
        .boolean()
        .default(true)
        .describe(
          "Whether to save the session for subsequent requests (default: true). Set to false to get token without replacing current session."
        ),
    }),
    execute: async (params) => {
      try {
        const result = await authenticateUser(
          { email: params.email, password: params.password },
          params.collection,
          params.baseUrl
        );

        // Store the authenticated client for subsequent operations (if saveSession is true)
        if (params.saveSession !== false) {
          const url = getPocketBaseUrl(params.baseUrl);
          const pb = createClient({ baseUrl: url });
          pb.authStore.save(result.token, result.user as any);
          clientStore.set(url, pb);
        }

        return formatOutput({
          success: true,
          message:
            params.saveSession !== false
              ? "Successfully authenticated as user (session saved)"
              : "Successfully authenticated as user (session not saved)",
          token: result.token,
          user: result.user,
          sessionSaved: params.saveSession !== false,
        });
      } catch (error) {
        const errorResponse = handleError(error);
        return formatOutput(errorResponse);
      }
    },
  });

  // PocketBase: Logout
  server.addTool({
    name: "logout",
    description: "Logout from PocketBase and clear the authentication session. This invalidates the current token.",
    parameters: z.object({
      baseUrl: z
        .string()
        .optional()
        .describe("PocketBase base URL (or use POCKETBASE_URL env var, default: http://127.0.0.1:8090)"),
    }),
    execute: async (params) => {
      try {
        const pb = getOrCreateClient(params.baseUrl);

        // Check if there's an active session
        const wasAuthenticated = isAuthenticated(pb);

        // Clear the auth store
        logout(pb);

        return formatOutput({
          success: true,
          message: wasAuthenticated ? "Successfully logged out" : "No active session to logout from",
          wasAuthenticated,
        });
      } catch (error) {
        const errorResponse = handleError(error);
        return formatOutput(errorResponse);
      }
    },
  });

  // PocketBase: Check authentication status
  server.addTool({
    name: "check_auth_status",
    description:
      "Check the current authentication status. Returns whether a valid session exists and the associated user information.",
    parameters: z.object({
      baseUrl: z
        .string()
        .optional()
        .describe("PocketBase base URL (or use POCKETBASE_URL env var, default: http://127.0.0.1:8090)"),
    }),
    execute: async (params) => {
      try {
        const pb = getOrCreateClient(params.baseUrl);
        const status = getAuthStatus(pb);

        return formatOutput({
          success: true,
          isAuthenticated: status.isAuthenticated,
          user: status.user,
          hasToken: status.token !== null,
        });
      } catch (error) {
        const errorResponse = handleError(error);
        return formatOutput(errorResponse);
      }
    },
  });

  // ============================================
  // Record CRUD Tools
  // Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5
  // ============================================

  // PocketBase: List records
  server.addTool({
    name: "list_records",
    description:
      "List records from a PocketBase collection with optional filtering, sorting, and pagination. Returns records with pagination metadata.",
    parameters: z.object({
      collection: z.string().describe("Collection name or ID to query"),
      filter: z
        .string()
        .optional()
        .describe(
          "Filter expression using PocketBase filter syntax (e.g., \"status='active' && created>'2023-01-01'\")"
        ),
      sort: z
        .string()
        .optional()
        .describe("Sort expression (e.g., '-created,title' for descending created, ascending title)"),
      page: z.number().int().positive().optional().describe("Page number (default: 1)"),
      perPage: z.number().int().positive().max(500).optional().describe("Records per page (default: 30, max: 500)"),
      expand: z.string().optional().describe("Relations to expand (e.g., 'author,comments')"),
      fields: z.string().optional().describe("Fields to return (e.g., 'id,title,created')"),
      adminToken: z.string().optional().describe("PocketBase admin token (or use POCKETBASE_ADMIN_TOKEN env var)"),
      baseUrl: z
        .string()
        .optional()
        .describe("PocketBase base URL (or use POCKETBASE_URL env var, default: http://127.0.0.1:8090)"),
      headers: z
        .record(z.string())
        .optional()
        .describe("Custom HTTP headers to send with the request (e.g., {'X-Custom-Header': 'value'})"),
    }),
    execute: async (params) => {
      try {
        const pb = getOrCreateClient(params.baseUrl);

        // Only override token if explicit adminToken provided
        if (params.adminToken) {
          pb.authStore.save(params.adminToken, null);
        } else if (!pb.authStore.isValid && process.env.POCKETBASE_ADMIN_TOKEN) {
          pb.authStore.save(process.env.POCKETBASE_ADMIN_TOKEN, null);
        }

        const result = await listRecords(pb, params.collection, {
          filter: params.filter,
          sort: params.sort,
          page: params.page,
          perPage: params.perPage,
          expand: params.expand,
          fields: params.fields,
          headers: params.headers,
        });

        return formatOutput(result);
      } catch (error) {
        const errorResponse = handleError(error);
        return formatOutput(errorResponse);
      }
    },
  });

  // PocketBase: Get record
  server.addTool({
    name: "get_record",
    description: "Get a single record by ID from a PocketBase collection. Returns the full record with all fields.",
    parameters: z.object({
      collection: z.string().describe("Collection name or ID"),
      id: z.string().describe("Record ID to retrieve"),
      expand: z.string().optional().describe("Relations to expand (e.g., 'author,comments')"),
      fields: z.string().optional().describe("Fields to return (e.g., 'id,title,created')"),
      adminToken: z.string().optional().describe("PocketBase admin token (or use POCKETBASE_ADMIN_TOKEN env var)"),
      baseUrl: z
        .string()
        .optional()
        .describe("PocketBase base URL (or use POCKETBASE_URL env var, default: http://127.0.0.1:8090)"),
      headers: z.record(z.string()).optional().describe("Custom HTTP headers to send with the request"),
    }),
    execute: async (params) => {
      try {
        const pb = getOrCreateClient(params.baseUrl);

        if (params.adminToken) {
          pb.authStore.save(params.adminToken, null);
        } else if (!pb.authStore.isValid && process.env.POCKETBASE_ADMIN_TOKEN) {
          pb.authStore.save(process.env.POCKETBASE_ADMIN_TOKEN, null);
        }

        const result = await getRecord(pb, params.collection, params.id, {
          expand: params.expand,
          fields: params.fields,
          headers: params.headers,
        });

        return formatOutput(result);
      } catch (error) {
        const errorResponse = handleError(error);
        return formatOutput(errorResponse);
      }
    },
  });

  // PocketBase: Create record
  server.addTool({
    name: "create_record",
    description:
      "Create a new record in a PocketBase collection. Returns the created record with its assigned ID and timestamps.",
    parameters: z.object({
      collection: z.string().describe("Collection name or ID"),
      data: z.record(z.any()).describe("Record data as key-value pairs matching the collection schema"),
      adminToken: z.string().optional().describe("PocketBase admin token (or use POCKETBASE_ADMIN_TOKEN env var)"),
      baseUrl: z
        .string()
        .optional()
        .describe("PocketBase base URL (or use POCKETBASE_URL env var, default: http://127.0.0.1:8090)"),
      headers: z.record(z.string()).optional().describe("Custom HTTP headers to send with the request"),
    }),
    execute: async (params) => {
      try {
        const pb = getOrCreateClient(params.baseUrl);

        if (params.adminToken) {
          pb.authStore.save(params.adminToken, null);
        } else if (!pb.authStore.isValid && process.env.POCKETBASE_ADMIN_TOKEN) {
          pb.authStore.save(process.env.POCKETBASE_ADMIN_TOKEN, null);
        }

        const result = await createRecord(pb, params.collection, params.data, {
          headers: params.headers,
        });

        return formatOutput(result);
      } catch (error) {
        const errorResponse = handleError(error);
        return formatOutput(errorResponse);
      }
    },
  });

  // PocketBase: Update record
  server.addTool({
    name: "update_record",
    description:
      "Update an existing record in a PocketBase collection. Only provided fields will be updated. Returns the updated record.",
    parameters: z.object({
      collection: z.string().describe("Collection name or ID"),
      id: z.string().describe("Record ID to update"),
      data: z.record(z.any()).describe("Updated record data as key-value pairs"),
      adminToken: z.string().optional().describe("PocketBase admin token (or use POCKETBASE_ADMIN_TOKEN env var)"),
      baseUrl: z
        .string()
        .optional()
        .describe("PocketBase base URL (or use POCKETBASE_URL env var, default: http://127.0.0.1:8090)"),
      headers: z.record(z.string()).optional().describe("Custom HTTP headers to send with the request"),
    }),
    execute: async (params) => {
      try {
        const pb = getOrCreateClient(params.baseUrl);

        if (params.adminToken) {
          pb.authStore.save(params.adminToken, null);
        } else if (!pb.authStore.isValid && process.env.POCKETBASE_ADMIN_TOKEN) {
          pb.authStore.save(process.env.POCKETBASE_ADMIN_TOKEN, null);
        }

        const result = await updateRecord(pb, params.collection, params.id, params.data, {
          headers: params.headers,
        });

        return formatOutput(result);
      } catch (error) {
        const errorResponse = handleError(error);
        return formatOutput(errorResponse);
      }
    },
  });

  // PocketBase: Delete record
  server.addTool({
    name: "delete_record",
    description:
      "Delete a record from a PocketBase collection. This permanently removes the record and any associated files.",
    parameters: z.object({
      collection: z.string().describe("Collection name or ID"),
      id: z.string().describe("Record ID to delete"),
      adminToken: z.string().optional().describe("PocketBase admin token (or use POCKETBASE_ADMIN_TOKEN env var)"),
      baseUrl: z
        .string()
        .optional()
        .describe("PocketBase base URL (or use POCKETBASE_URL env var, default: http://127.0.0.1:8090)"),
      headers: z.record(z.string()).optional().describe("Custom HTTP headers to send with the request"),
    }),
    execute: async (params) => {
      try {
        const pb = getOrCreateClient(params.baseUrl);

        if (params.adminToken) {
          pb.authStore.save(params.adminToken, null);
        } else if (!pb.authStore.isValid && process.env.POCKETBASE_ADMIN_TOKEN) {
          pb.authStore.save(process.env.POCKETBASE_ADMIN_TOKEN, null);
        }

        const result = await deleteRecord(pb, params.collection, params.id, {
          headers: params.headers,
        });

        return formatOutput({
          ...result,
          message: `Record '${params.id}' has been deleted from '${params.collection}'`,
        });
      } catch (error) {
        const errorResponse = handleError(error);
        return formatOutput(errorResponse);
      }
    },
  });

  // ============================================
  // User Management Tools
  // Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
  // ============================================

  // PocketBase: List users
  server.addTool({
    name: "list_users",
    description:
      "List users from a PocketBase auth collection. Requires admin authentication. Returns users with pagination metadata.",
    parameters: z.object({
      collection: z.string().default("users").describe("Auth collection name (default: 'users')"),
      filter: z
        .string()
        .optional()
        .describe('Filter expression using PocketBase filter syntax (e.g., "verified=true")'),
      sort: z
        .string()
        .optional()
        .describe("Sort expression (e.g., '-created,email' for descending created, ascending email)"),
      page: z.number().int().positive().optional().describe("Page number (default: 1)"),
      perPage: z.number().int().positive().max(500).optional().describe("Users per page (default: 30, max: 500)"),
      expand: z.string().optional().describe("Relations to expand"),
      fields: z.string().optional().describe("Fields to return (e.g., 'id,email,verified')"),
      adminToken: z.string().optional().describe("PocketBase admin token for privileged access"),
      baseUrl: z
        .string()
        .optional()
        .describe("PocketBase base URL (or use POCKETBASE_URL env var, default: http://127.0.0.1:8090)"),
      headers: z.record(z.string()).optional().describe("Custom HTTP headers to send with the request"),
    }),
    execute: async (params) => {
      try {
        const pb = getOrCreateClient(params.baseUrl);

        if (params.adminToken) {
          pb.authStore.save(params.adminToken, null);
        } else if (!pb.authStore.isValid && process.env.POCKETBASE_ADMIN_TOKEN) {
          pb.authStore.save(process.env.POCKETBASE_ADMIN_TOKEN, null);
        }

        const result = await listUsers(pb, params.collection, {
          filter: params.filter,
          sort: params.sort,
          page: params.page,
          perPage: params.perPage,
          expand: params.expand,
          fields: params.fields,
          headers: params.headers,
        });

        return formatOutput(result);
      } catch (error) {
        const errorResponse = handleError(error);
        return formatOutput(errorResponse);
      }
    },
  });

  // PocketBase: Get user
  server.addTool({
    name: "get_user",
    description: "Get a single user by ID from a PocketBase auth collection. Returns the full user record.",
    parameters: z.object({
      collection: z.string().default("users").describe("Auth collection name (default: 'users')"),
      id: z.string().describe("User ID to retrieve"),
      expand: z.string().optional().describe("Relations to expand"),
      fields: z.string().optional().describe("Fields to return (e.g., 'id,email,verified')"),
      adminToken: z.string().optional().describe("PocketBase admin token for privileged access"),
      baseUrl: z
        .string()
        .optional()
        .describe("PocketBase base URL (or use POCKETBASE_URL env var, default: http://127.0.0.1:8090)"),
      headers: z.record(z.string()).optional().describe("Custom HTTP headers to send with the request"),
    }),
    execute: async (params) => {
      try {
        const pb = getOrCreateClient(params.baseUrl);

        if (params.adminToken) {
          pb.authStore.save(params.adminToken, null);
        } else if (!pb.authStore.isValid && process.env.POCKETBASE_ADMIN_TOKEN) {
          pb.authStore.save(process.env.POCKETBASE_ADMIN_TOKEN, null);
        }

        const result = await getUser(pb, params.collection, params.id, {
          expand: params.expand,
          fields: params.fields,
          headers: params.headers,
        });

        return formatOutput(result);
      } catch (error) {
        const errorResponse = handleError(error);
        return formatOutput(errorResponse);
      }
    },
  });

  // PocketBase: Create user
  server.addTool({
    name: "create_user",
    description: "Create a new user in a PocketBase auth collection. Returns the created user with assigned ID.",
    parameters: z.object({
      collection: z.string().default("users").describe("Auth collection name (default: 'users')"),
      email: z.string().email().describe("User email address"),
      password: z.string().min(8).describe("User password (minimum 8 characters)"),
      passwordConfirm: z.string().min(8).describe("Password confirmation (must match password)"),
      emailVisibility: z.boolean().optional().describe("Whether email is visible to other users (default: false)"),
      verified: z.boolean().optional().describe("Whether user is verified (default: false)"),
      name: z.string().optional().describe("User display name"),
      adminToken: z.string().optional().describe("PocketBase admin token for privileged access"),
      baseUrl: z
        .string()
        .optional()
        .describe("PocketBase base URL (or use POCKETBASE_URL env var, default: http://127.0.0.1:8090)"),
      headers: z.record(z.string()).optional().describe("Custom HTTP headers to send with the request"),
    }),
    execute: async (params) => {
      try {
        const pb = getOrCreateClient(params.baseUrl);

        if (params.adminToken) {
          pb.authStore.save(params.adminToken, null);
        } else if (!pb.authStore.isValid && process.env.POCKETBASE_ADMIN_TOKEN) {
          pb.authStore.save(process.env.POCKETBASE_ADMIN_TOKEN, null);
        }

        const result = await createUser(
          pb,
          params.collection,
          {
            email: params.email,
            password: params.password,
            passwordConfirm: params.passwordConfirm,
            emailVisibility: params.emailVisibility,
            verified: params.verified,
            name: params.name,
          },
          { headers: params.headers }
        );

        return formatOutput(result);
      } catch (error) {
        const errorResponse = handleError(error);
        return formatOutput(errorResponse);
      }
    },
  });

  // PocketBase: Update user
  server.addTool({
    name: "update_user",
    description:
      "Update an existing user in a PocketBase auth collection. Requires admin authentication. Only provided fields will be updated.",
    parameters: z.object({
      collection: z.string().default("users").describe("Auth collection name (default: 'users')"),
      id: z.string().describe("User ID to update"),
      email: z.string().email().optional().describe("New email address"),
      password: z.string().min(8).optional().describe("New password (minimum 8 characters)"),
      passwordConfirm: z.string().min(8).optional().describe("Password confirmation (required if password is set)"),
      oldPassword: z.string().optional().describe("Current password (required for non-admin password changes)"),
      emailVisibility: z.boolean().optional().describe("Whether email is visible to other users"),
      verified: z.boolean().optional().describe("Whether user is verified"),
      name: z.string().optional().describe("User display name"),
      adminToken: z.string().optional().describe("PocketBase admin token for privileged access"),
      baseUrl: z
        .string()
        .optional()
        .describe("PocketBase base URL (or use POCKETBASE_URL env var, default: http://127.0.0.1:8090)"),
      headers: z.record(z.string()).optional().describe("Custom HTTP headers to send with the request"),
    }),
    execute: async (params) => {
      try {
        const pb = getOrCreateClient(params.baseUrl);

        if (params.adminToken) {
          pb.authStore.save(params.adminToken, null);
        } else if (!pb.authStore.isValid && process.env.POCKETBASE_ADMIN_TOKEN) {
          pb.authStore.save(process.env.POCKETBASE_ADMIN_TOKEN, null);
        }

        const updateData: Record<string, any> = {};
        if (params.email !== undefined) updateData.email = params.email;
        if (params.password !== undefined) updateData.password = params.password;
        if (params.passwordConfirm !== undefined) updateData.passwordConfirm = params.passwordConfirm;
        if (params.oldPassword !== undefined) updateData.oldPassword = params.oldPassword;
        if (params.emailVisibility !== undefined) updateData.emailVisibility = params.emailVisibility;
        if (params.verified !== undefined) updateData.verified = params.verified;
        if (params.name !== undefined) updateData.name = params.name;

        const result = await updateUser(pb, params.collection, params.id, updateData, {
          headers: params.headers,
        });

        return formatOutput(result);
      } catch (error) {
        const errorResponse = handleError(error);
        return formatOutput(errorResponse);
      }
    },
  });

  // PocketBase: Delete user
  server.addTool({
    name: "delete_user",
    description: "Delete a user from a PocketBase auth collection. This permanently removes the user account.",
    parameters: z.object({
      collection: z.string().default("users").describe("Auth collection name (default: 'users')"),
      id: z.string().describe("User ID to delete"),
      adminToken: z.string().optional().describe("PocketBase admin token for privileged access"),
      baseUrl: z
        .string()
        .optional()
        .describe("PocketBase base URL (or use POCKETBASE_URL env var, default: http://127.0.0.1:8090)"),
      headers: z.record(z.string()).optional().describe("Custom HTTP headers to send with the request"),
    }),
    execute: async (params) => {
      try {
        const pb = getOrCreateClient(params.baseUrl);

        if (params.adminToken) {
          pb.authStore.save(params.adminToken, null);
        } else if (!pb.authStore.isValid && process.env.POCKETBASE_ADMIN_TOKEN) {
          pb.authStore.save(process.env.POCKETBASE_ADMIN_TOKEN, null);
        }

        const result = await deleteUser(pb, params.collection, params.id, {
          headers: params.headers,
        });

        return formatOutput({
          ...result,
          message: `User '${params.id}' has been deleted from '${params.collection}'`,
        });
      } catch (error) {
        const errorResponse = handleError(error);
        return formatOutput(errorResponse);
      }
    },
  });

  // ============================================
  // Custom HTTP Requests Tool
  // Allows any authenticated user to send custom HTTP requests
  // ============================================

  server.addTool({
    name: "send_custom_request",
    description: "Send raw HTTP requests to PocketBase API endpoints. Supports any authenticated user (admin or regular user) and maintains session state.",
    parameters: z.object({
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).describe("HTTP method"),
      endpoint: z.string().describe("API endpoint (e.g., '/api/collections/posts/records', '/api/users')"),
      body: z.any().optional().describe("Request body for POST/PUT/PATCH requests"),
      queryParams: z.record(z.string()).optional().describe("URL query parameters"),
      headers: z.record(z.string()).optional().describe("Custom HTTP headers to send with the request"),
      baseUrl: z.string().optional().describe("PocketBase base URL (or use POCKETBASE_URL env var, default: http://127.0.0.1:8090)"),
      adminToken: z.string().optional().describe("Optional admin token for privileged endpoints (or use current session)")
    }),
    execute: async (params) => {
      try {
        // Use getOrCreateClient to support any authentication type (admin, user, or none)
        const pb = getOrCreateClient(params.baseUrl);

        // If explicit admin token provided, override current auth
        if (params.adminToken) {
          pb.authStore.save(params.adminToken, null);
        } else if (!pb.authStore.isValid && process.env.POCKETBASE_ADMIN_TOKEN) {
          // Fallback to env token if no valid session
          pb.authStore.save(process.env.POCKETBASE_ADMIN_TOKEN, null);
        }

        console.error(`[send_custom_request] ${params.method} ${params.endpoint} - Auth: ${pb.authStore.isValid ? 'Valid' : 'None'}`);

        // Build full URL
        const url = params.endpoint.startsWith('/') ? params.endpoint : `/${params.endpoint}`;
        
        // Build the full URL with query parameters
        let fullUrl = url;
        if (params.queryParams && Object.keys(params.queryParams).length > 0) {
          const queryString = new URLSearchParams(params.queryParams).toString();
          fullUrl += (url.includes('?') ? '&' : '?') + queryString;
        }

        // Prepare request options
        const requestOptions: any = {
          method: params.method,
          headers: {
            ...params.headers
          }
        };

        // Add body for POST/PUT/PATCH requests
        if (params.body && ['POST', 'PUT', 'PATCH'].includes(params.method)) {
          if (params.headers?.['Content-Type'] === 'multipart/form-data') {
            // Handle multipart form data
            requestOptions.body = params.body;
          } else {
            // Default to JSON
            requestOptions.headers['Content-Type'] = 'application/json';
            requestOptions.body = JSON.stringify(params.body);
          }
        }

        // Use PocketBase's built-in fetch method
        const response = await pb.send(fullUrl, requestOptions);

        return formatOutput({
          success: true,
          method: params.method,
          endpoint: params.endpoint,
          statusCode: response.status || 200,
          data: response.data || response,
          headers: response.headers || {}
        });

      } catch (error) {
        const errorResponse = handleError(error);
        return formatOutput({
          ...errorResponse,
          method: params.method,
          endpoint: params.endpoint
        });
      }
    },
  });
}
