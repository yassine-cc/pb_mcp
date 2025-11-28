import { FastMCP } from "fastmcp";
import { registerResources } from "../core/resources.js";
import { registerTools } from "../core/tools.js";
import { registerPrompts } from "../core/prompts.js";
import { authenticateAdmin } from "../core/services/pocketbase/index.js";

/**
 * Auto-authenticate with PocketBase if admin credentials are provided in env
 * This allows users to provide email/password instead of a pre-existing token
 */
async function autoAuthenticateAdmin(): Promise<void> {
  const email = process.env.POCKETBASE_ADMIN_EMAIL;
  const password = process.env.POCKETBASE_ADMIN_PASSWORD;
  const baseUrl = process.env.POCKETBASE_URL;

  // Skip if credentials not provided
  if (!email || !password) {
    return;
  }

  // Skip if token already exists
  if (process.env.POCKETBASE_ADMIN_TOKEN) {
    console.error("Admin token already set, skipping auto-authentication");
    return;
  }

  try {
    console.error(`Attempting auto-authentication as admin (${email})...`);
    const result = await authenticateAdmin({ email, password }, baseUrl);

    // Store the token for subsequent requests
    process.env.POCKETBASE_ADMIN_TOKEN = result.token;
    console.error("Successfully auto-authenticated as admin");
  } catch (error) {
    console.error("Auto-authentication failed:", error instanceof Error ? error.message : error);
    console.error("Tools requiring admin access will fail unless a valid token is provided per-request");
  }
}

// Create and start the MCP server
async function startServer() {
  try {
    // Auto-authenticate if admin credentials provided
    await autoAuthenticateAdmin();

    // Create a new FastMCP server instance
    const server = new FastMCP({
      name: "MCP Server",
      version: "1.0.0",
    });

    // Register all resources, tools, and prompts
    registerResources(server);
    registerTools(server);
    registerPrompts(server);

    // Log server information
    console.error(`MCP Server initialized`);
    console.error("Server is ready to handle requests");

    return server;
  } catch (error) {
    console.error("Failed to initialize server:", error);
    process.exit(1);
  }
}

// Export the server creation function
export default startServer;
