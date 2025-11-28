/**
 * PocketBase Service Layer
 *
 * This module provides a comprehensive interface to PocketBase functionality
 * through the MCP server, including:
 * - Client factory for creating configured PocketBase instances
 * - Authentication services (admin and user)
 * - Collection management
 * - Record CRUD operations
 * - User management
 * - Error handling utilities
 */

export * from "./client-factory.js";
export * from "./auth-service.js";
export * from "./error-handler.js";
export * from "./collection-service.js";
export * from "./record-service.js";
export * from "./user-service.js";
export * from "./file-utils.js";
