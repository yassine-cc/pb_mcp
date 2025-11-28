## [2.2.0] (2025-11-28)

### Features

* Add `send_custom_request` tool for raw HTTP requests to any PocketBase API endpoint
* Support all authentication types (admin, user, public) for custom requests
* Add comprehensive prompt `pocketbase_custom_request` to help construct custom requests
* Maintain session state across custom HTTP requests
* Support for advanced PocketBase API features (real-time, file uploads, custom validation)

### Improvements

* Enhanced documentation with extensive custom request examples
* Better error handling for HTTP requests with method/endpoint context
* Flexible authentication fallback (session → env token → explicit token)

## [2.1.0] (2025-11-28)

### Features

* Add `saveSession` parameter to `authenticate_admin` and `authenticate_user` tools
* Add custom HTTP headers support for all record and user operations
* Add auto-authentication at startup via `POCKETBASE_ADMIN_EMAIL` and `POCKETBASE_ADMIN_PASSWORD` env vars
* Preserve user session across tool calls when authenticated
* Remove forced admin authentication requirement for user operations (let PocketBase rules handle permissions)

### Bug Fixes

* Fix session persistence issue where authenticated client was not reused
* Fix URL normalization for consistent client store lookup
* Fix `isAdminAuthenticated` to properly detect admin users from saved sessions

### Contributors

* Abdramane Sakone

---

## [2.0.1](https://github.com/mcpdotdirect/template-mcp-server/compare/v2.0.0...v2.0.1) (2025-04-01)



# [2.0.0](https://github.com/mcpdotdirect/template-mcp-server/compare/v1.0.2...v2.0.0) (2025-04-01)


### Bug Fixes

* fixed missing deps ([4544887](https://github.com/mcpdotdirect/template-mcp-server/commit/4544887fad7864041a501aff566e225dfb67515d))


### Features

* implementing FastMCP standard for templates ([fc035eb](https://github.com/mcpdotdirect/template-mcp-server/commit/fc035eb91555545bf3cb585db90f11d043ab8d27))



## [1.0.2](https://github.com/mcpdotdirect/template-mcp-server/compare/v1.0.1...v1.0.2) (2025-03-22)



## [1.0.1](https://github.com/mcpdotdirect/template-mcp-server/compare/v1.0.0...v1.0.1) (2025-03-22)


### Bug Fixes

* typo ([4c12f4b](https://github.com/mcpdotdirect/template-mcp-server/commit/4c12f4b8a84310656882b6fa0ce0f78a98bd2eaf))


### Features

* add CLI tool for creating MCP server projects and update package.json ([8e1191e](https://github.com/mcpdotdirect/template-mcp-server/commit/8e1191e0e9e299fd0e02c4822d2141c64fe8d57e))



