# PocketBase Services

This directory contains the PocketBase MCP server service implementations.

## Structure

```
pocketbase/
├── test-utils/          # Testing utilities and helpers
│   ├── generators.ts    # fast-check arbitraries for property-based testing
│   ├── helpers.ts       # Test helper functions
│   ├── types.ts         # Common test types
│   ├── index.ts         # Main export file
│   ├── setup.test.ts    # Framework verification tests
│   └── README.md        # Test utilities documentation
└── README.md            # This file
```

## Services (To Be Implemented)

The following services will be implemented in this directory:

- **Authentication Service** - Handle admin and user authentication
- **Collection Service** - Manage collection schemas and metadata
- **Record Service** - Perform CRUD operations on records
- **User Service** - Manage user accounts (admin operations)
- **Client Factory** - Create and configure PocketBase clients
- **Error Handler** - Transform errors into consistent responses

## Testing

This project uses:
- **Vitest** for unit testing
- **fast-check** for property-based testing

### Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

### Test Configuration

- Configuration: `vitest.config.ts` in project root
- Test timeout: 30 seconds (for property tests with 100+ iterations)
- Environment: Node.js
- Test files: `**/*.test.ts`, `**/*.spec.ts`

### Property-Based Testing

Each service will have property-based tests that validate correctness properties defined in the design document. Each property test:

- Runs at least 100 iterations
- Is tagged with the property it validates
- Uses appropriate generators from `test-utils/generators.ts`
- Tests with real PocketBase SDK calls (minimal mocking)

See `test-utils/README.md` for detailed testing guidelines.

## Development

When implementing services:

1. Create the service file (e.g., `auth-service.ts`)
2. Create corresponding test file (e.g., `auth-service.test.ts`)
3. Implement unit tests for specific examples
4. Implement property tests for universal properties
5. Tag property tests with design document references

## Environment Variables

Test configuration can be set via environment variables:

```bash
POCKETBASE_TEST_URL=http://127.0.0.1:8090
POCKETBASE_TEST_ADMIN_EMAIL=test@example.com
POCKETBASE_TEST_ADMIN_PASSWORD=testpassword123
```

See `.env.test.example` in project root for full configuration options.
