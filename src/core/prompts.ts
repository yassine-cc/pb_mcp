import { FastMCP } from "fastmcp";

/**
 * Register all prompts with the MCP server
 * @param server The FastMCP server instance
 */
export function registerPrompts(server: FastMCP) {
  // PocketBase filter query builder prompt
  server.addPrompt({
    name: "pocketbase_filter",
    description: "Help construct PocketBase filter queries with proper syntax",
    arguments: [
      {
        name: "description",
        description: "Describe what records you want to filter (e.g., 'active users created this month')",
        required: true,
      },
      {
        name: "collection",
        description: "Collection name to query",
        required: false,
      },
    ],
    load: async ({ description, collection }) => {
      return `Help me construct a PocketBase filter query.

**What I want to find:** ${description}
${collection ? `**Collection:** ${collection}` : ""}

## PocketBase Filter Syntax Reference

### Comparison Operators
- \`=\` equals: \`status = 'active'\`
- \`!=\` not equals: \`status != 'deleted'\`
- \`>\` greater than: \`price > 100\`
- \`>=\` greater or equal: \`age >= 18\`
- \`<\` less than: \`quantity < 10\`
- \`<=\` less or equal: \`score <= 100\`

### Text Operators
- \`~\` contains: \`title ~ 'hello'\`
- \`!~\` not contains: \`email !~ 'spam'\`

### Logical Operators
- \`&&\` AND: \`status = 'active' && verified = true\`
- \`||\` OR: \`role = 'admin' || role = 'moderator'\`

### Null Checks
- \`= null\` is null: \`avatar = null\`
- \`!= null\` is not null: \`avatar != null\`

### Date Comparisons
- Use ISO format: \`created > '2024-01-01 00:00:00'\`
- Current time macros: \`@now\`, \`@todayStart\`, \`@todayEnd\`, \`@monthStart\`, \`@monthEnd\`, \`@yearStart\`, \`@yearEnd\`

### Relation Queries
- Dot notation: \`author.name = 'John'\`
- Nested: \`post.author.verified = true\`

### Array/Select Fields
- Contains value: \`tags ~ 'featured'\`

Please provide the filter query for my requirements.`;
    },
  });

  // Collection schema builder prompt
  server.addPrompt({
    name: "pocketbase_schema",
    description: "Help design a PocketBase collection schema",
    arguments: [
      {
        name: "purpose",
        description: "Describe what this collection will store (e.g., 'blog posts with authors and tags')",
        required: true,
      },
      {
        name: "collection_name",
        description: "Proposed collection name",
        required: false,
      },
    ],
    load: async ({ purpose, collection_name }) => {
      return `Help me design a PocketBase collection schema.

**Purpose:** ${purpose}
${collection_name ? `**Proposed Name:** ${collection_name}` : ""}

## PocketBase Field Types

| Type | Description | Options |
|------|-------------|---------|
| \`text\` | Plain text | min, max, pattern |
| \`editor\` | Rich text HTML | - |
| \`number\` | Integer or decimal | min, max, noDecimal |
| \`bool\` | True/false | - |
| \`email\` | Email address | exceptDomains, onlyDomains |
| \`url\` | URL | exceptDomains, onlyDomains |
| \`date\` | Date/datetime | min, max |
| \`select\` | Single/multi select | values, maxSelect |
| \`file\` | File upload | maxSelect, maxSize, mimeTypes |
| \`relation\` | Link to another collection | collectionId, cascadeDelete, maxSelect |
| \`json\` | JSON data | maxSize |
| \`autodate\` | Auto-set timestamp | onCreate, onUpdate |

## Collection Types
- \`base\` - Regular data collection
- \`auth\` - User authentication collection (has email, password, verified fields)
- \`view\` - SQL view (read-only)

## Access Rules
Rules use filter syntax. Empty string = public, null = admin only.
- \`listRule\` - Who can list records
- \`viewRule\` - Who can view individual records
- \`createRule\` - Who can create records
- \`updateRule\` - Who can update records
- \`deleteRule\` - Who can delete records

Common patterns:
- Public read: \`""\`
- Authenticated users: \`"@request.auth.id != ''"\`
- Owner only: \`"@request.auth.id = user"\`
- Admin only: \`null\`

Please suggest a schema with field definitions and access rules.`;
    },
  });

  // Access rules helper prompt
  server.addPrompt({
    name: "pocketbase_rules",
    description: "Help configure PocketBase collection access rules",
    arguments: [
      {
        name: "scenario",
        description: "Describe your access control needs (e.g., 'users can only edit their own posts')",
        required: true,
      },
      {
        name: "collection",
        description: "Collection name",
        required: false,
      },
    ],
    load: async ({ scenario, collection }) => {
      return `Help me configure PocketBase access rules.

**Scenario:** ${scenario}
${collection ? `**Collection:** ${collection}` : ""}

## Access Rule Syntax

Rules use the same filter syntax as queries, with special variables:

### Request Variables
- \`@request.auth.id\` - Current user's ID (empty if not authenticated)
- \`@request.auth.email\` - Current user's email
- \`@request.auth.verified\` - Whether user is verified
- \`@request.auth.collectionName\` - Auth collection name
- \`@request.data.fieldName\` - Data being submitted

### Record Variables (for update/delete)
- \`id\` - Record ID
- \`created\` - Creation timestamp
- \`updated\` - Update timestamp
- Any field name directly

### Common Rule Patterns

**Public access (anyone):**
\`""\`

**Authenticated users only:**
\`"@request.auth.id != ''"\`

**Owner only (assuming 'user' field):**
\`"@request.auth.id = user"\`

**Owner or admin:**
\`"@request.auth.id = user || @request.auth.role = 'admin'"\`

**Verified users only:**
\`"@request.auth.verified = true"\`

**Admin only:**
\`null\`

**Prevent field modification:**
\`"@request.data.status:isset = false || status = @request.data.status"\`

**Based on related record:**
\`"@request.auth.id = post.author"\`

Please suggest the appropriate rules for each operation (list, view, create, update, delete).`;
    },
  });

  // Query builder prompt
  server.addPrompt({
    name: "pocketbase_query",
    description: "Help build a complete PocketBase query with filter, sort, and pagination",
    arguments: [
      {
        name: "goal",
        description: "What data do you want to retrieve?",
        required: true,
      },
      {
        name: "collection",
        description: "Collection to query",
        required: true,
      },
    ],
    load: async ({ goal, collection }) => {
      return `Help me build a PocketBase query.

**Goal:** ${goal}
**Collection:** ${collection}

## Query Parameters

### Filter
Filter records using PocketBase syntax:
\`\`\`
filter: "status = 'active' && created > '2024-01-01'"
\`\`\`

### Sort
Sort by fields (prefix with - for descending):
\`\`\`
sort: "-created,title"  // newest first, then by title
\`\`\`

### Pagination
\`\`\`
page: 1
perPage: 20  // max 500
\`\`\`

### Expand Relations
Include related records:
\`\`\`
expand: "author,comments"
expand: "author.profile"  // nested
\`\`\`

### Select Fields
Return only specific fields:
\`\`\`
fields: "id,title,created,expand.author.name"
\`\`\`

## Example Query
\`\`\`json
{
  "collection": "${collection}",
  "filter": "status = 'published'",
  "sort": "-created",
  "page": 1,
  "perPage": 10,
  "expand": "author"
}
\`\`\`

Please provide the complete query parameters for my goal.`;
    },
  });
}
