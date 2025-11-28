# PocketBase MCP Server

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6)

A Model Context Protocol (MCP) server that provides comprehensive access to PocketBase functionality. This server enables AI assistants and other MCP clients to interact with PocketBase databases for authentication, data management, and administrative operations.

## Features

- **Authentication**: Admin and user authentication with session management
- **Session Persistence**: Save sessions across tool calls with `saveSession` parameter
- **Auto-Authentication**: Automatically authenticate at startup using environment variables
- **Collection Management**: Create, update, delete, and query collections (admin only)
- **Record CRUD**: Full create, read, update, delete operations on records
- **User Management**: Manage user accounts in auth collections
- **Custom Headers**: Send custom HTTP headers with any request
- **Query Support**: Filtering, sorting, and pagination for records and users
- **Error Handling**: Consistent, informative error responses
- **Multi-Instance**: Support for connecting to multiple PocketBase instances
- **TOON Output Format**: Optional TOON format for 30-60% token reduction with LLMs

## Installation

```bash
# Clone the repository
git clone https://github.com/ssakone/pocketbase-mcp-server.git
cd pocketbase-mcp-server

# Install dependencies
npm install

# Build the project
npm run build
```

## Configuration

### Environment Variables

Create a `.env` file or set environment variables:

```bash
# PocketBase server URL (default: http://127.0.0.1:8090)
POCKETBASE_URL=http://127.0.0.1:8090

# Admin token for authenticated operations (optional - can be provided per-request)
POCKETBASE_ADMIN_TOKEN=your_admin_token_here

# Auto-authentication at startup (optional)
# If both are provided, the server will authenticate and obtain a token automatically
POCKETBASE_ADMIN_EMAIL=admin@example.com
POCKETBASE_ADMIN_PASSWORD=your_admin_password

# Output format: json (default) or toon
# TOON format reduces token usage by 30-60% when communicating with LLMs
MCP_OUTPUT_FORMAT=json
```

### Configuration File

Alternatively, create a `pocketbase.config.json`:

```json
{
  "pocketbaseUrl": "http://127.0.0.1:8090",
  "pocketbaseAdminToken": "your_admin_token_here"
}
```

## Running the Server

### stdio Mode (for MCP clients like Cursor, Kiro)

```bash
npm start
```

### HTTP/SSE Mode (for web clients and remote access)

```bash
# Default port 3001
npm run start:http

# Custom port
PORT=8080 npm run start:http
```

The HTTP server exposes an SSE endpoint at `http://localhost:3001/sse`.

## MCP Client Configuration

### Cursor/Kiro Configuration

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "pocketbase": {
      "command": "npm",
      "args": ["start"],
      "cwd": "/path/to/pocketbase-mcp-server",
      "env": {
        "POCKETBASE_URL": "http://127.0.0.1:8090",
        "POCKETBASE_ADMIN_EMAIL": "admin@example.com",
        "POCKETBASE_ADMIN_PASSWORD": "your_password"
      }
    }
  }
}
```

## Available Tools

### Authentication Tools

#### `authenticate_admin`
Authenticate as a PocketBase admin with full access to all operations.

```json
{
  "email": "admin@example.com",
  "password": "adminpassword",
  "baseUrl": "http://127.0.0.1:8090",
  "saveSession": true
}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `email` | string | Admin email address |
| `password` | string | Admin password |
| `baseUrl` | string | PocketBase URL (optional) |
| `saveSession` | boolean | Save session for subsequent requests (default: true) |

#### `authenticate_user`
Authenticate as a regular user with permissions based on collection rules.

```json
{
  "email": "user@example.com",
  "password": "userpassword",
  "collection": "users",
  "baseUrl": "http://127.0.0.1:8090",
  "saveSession": true
}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `email` | string | User email address |
| `password` | string | User password |
| `collection` | string | Auth collection name (default: "users") |
| `baseUrl` | string | PocketBase URL (optional) |
| `saveSession` | boolean | Save session for subsequent requests (default: true) |

#### `logout`
Clear the current authentication session.

#### `check_auth_status`
Check if there's an active authentication session.

### Collection Management Tools (Admin Only)

#### `list_collections`
Get all collections with their metadata.

#### `get_collection`
Get detailed information about a specific collection.

#### `create_collection`
Create a new collection with schema definition.

```json
{
  "name": "posts",
  "type": "base",
  "schema": [
    { "name": "title", "type": "text", "required": true },
    { "name": "content", "type": "editor", "required": false },
    { "name": "published", "type": "bool", "required": false }
  ],
  "listRule": "",
  "viewRule": "",
  "createRule": "@request.auth.id != ''",
  "updateRule": "@request.auth.id != ''",
  "deleteRule": "@request.auth.id != ''"
}
```

#### `update_collection`
Update an existing collection's schema or rules.

#### `delete_collection`
Delete a collection and all its records.

### Record CRUD Tools

All record tools support custom headers via the `headers` parameter.

#### `list_records`
Query records with filtering, sorting, and pagination.

```json
{
  "collection": "posts",
  "filter": "published = true && created > '2024-01-01'",
  "sort": "-created,title",
  "page": 1,
  "perPage": 20,
  "expand": "author",
  "headers": { "X-Custom-Header": "value" }
}
```

#### `get_record`
Get a single record by ID.

```json
{
  "collection": "posts",
  "id": "record_id_here",
  "expand": "author,comments"
}
```

#### `create_record`
Create a new record in a collection.

```json
{
  "collection": "posts",
  "data": {
    "title": "My First Post",
    "content": "Hello, world!",
    "published": true
  }
}
```

#### `update_record`
Update an existing record.

#### `delete_record`
Delete a record from a collection.

### User Management Tools

User management tools respect PocketBase collection rules. Admin token is optional and only needed for privileged operations.

#### `list_users`
List users from an auth collection with filtering.

```json
{
  "collection": "users",
  "filter": "verified = true",
  "sort": "-created",
  "page": 1,
  "perPage": 20,
  "headers": { "X-Custom-Header": "value" }
}
```

#### `get_user`
Get a single user by ID.

#### `create_user`
Create a new user account.

```json
{
  "collection": "users",
  "email": "newuser@example.com",
  "password": "securepassword123",
  "passwordConfirm": "securepassword123",
  "emailVisibility": false,
  "verified": true,
  "name": "John Doe"
}
```

#### `update_user`
Update an existing user.

#### `delete_user`
Delete a user account.

## Common Parameters

Most tools accept these optional parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `baseUrl` | string | PocketBase server URL |
| `adminToken` | string | Admin token for privileged access |
| `headers` | object | Custom HTTP headers to send with the request |

## Error Handling

All tools return consistent error responses:

```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": { "field": "specific error details" },
  "suggestion": "How to fix the error"
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `AUTH_INVALID` | Invalid credentials |
| `AUTH_REQUIRED` | Authentication required |
| `FORBIDDEN` | Insufficient permissions |
| `NOT_FOUND` | Resource not found |
| `VALIDATION_ERROR` | Invalid input data |
| `NETWORK_ERROR` | Connection issues |
| `UNKNOWN_ERROR` | Unexpected error |

## PocketBase Filter Syntax

The `filter` parameter uses PocketBase's filter syntax:

```
# Equality
status = 'active'

# Comparison
created > '2024-01-01'
price >= 100

# Logical operators
status = 'active' && published = true
category = 'tech' || category = 'science'

# Contains/Like
title ~ 'hello'      # contains
title !~ 'spam'      # not contains

# Null checks
avatar = null
avatar != null

# Relations
author.name = 'John'
```

## Development

```bash
# Run in development mode with auto-reload
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Build for production
npm run build
```

## Author

Abdramane Sakone

## License

MIT License - see [LICENSE](LICENSE) for details.
