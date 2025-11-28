# PocketBase Test Utilities

This directory contains testing utilities for PocketBase service testing, including property-based testing generators and helper functions.

## Structure

- `generators.ts` - fast-check arbitraries for generating test data
- `helpers.ts` - Test helper functions for setup, cleanup, and assertions
- `index.ts` - Main export file for all test utilities
- `setup.test.ts` - Verification tests for the testing framework

## Usage

### Property-Based Testing with fast-check

```typescript
import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { emailArbitrary, passwordArbitrary } from './test-utils';

describe('Authentication', () => {
  it('should authenticate with any valid credentials', () => {
    fc.assert(
      fc.property(
        emailArbitrary(),
        passwordArbitrary(),
        async (email, password) => {
          // Test authentication with generated credentials
          const result = await authenticate(email, password);
          return result.token !== undefined;
        }
      ),
      { numRuns: 100 } // Run 100 iterations
    );
  });
});
```

### Test Helpers

```typescript
import { createTestClient, authenticateAsAdmin, cleanupTestCollections } from './test-utils';

describe('Collection Service', () => {
  let pb: PocketBase;

  beforeEach(async () => {
    pb = createTestClient();
    await authenticateAsAdmin(pb);
  });

  afterEach(async () => {
    await cleanupTestCollections(pb);
  });

  it('should create collection', async () => {
    // Your test here
  });
});
```

## Available Generators

- `emailArbitrary()` - Valid email addresses
- `passwordArbitrary()` - Strong passwords (8+ chars, letters + numbers)
- `collectionNameArbitrary()` - Valid collection names
- `fieldNameArbitrary()` - Valid field names
- `fieldTypeArbitrary()` - PocketBase field types
- `schemaFieldArbitrary()` - Complete schema field definitions
- `collectionTypeArbitrary()` - Collection types (base, auth, view)
- `filterExpressionArbitrary()` - Filter expressions
- `sortParameterArbitrary()` - Sort parameters
- `paginationArbitrary()` - Pagination parameters
- `recordDataArbitrary()` - Record data
- `urlArbitrary()` - Valid URLs
- `userDataArbitrary()` - User creation data

## Available Helpers

- `getTestConfig()` - Get test configuration from environment
- `createTestClient(baseUrl?)` - Create test PocketBase client
- `authenticateAsAdmin(pb)` - Authenticate as admin
- `cleanupTestCollections(pb, prefix)` - Clean up test collections
- `cleanupTestUsers(pb, collection, emailPrefix)` - Clean up test users
- `waitFor(condition, timeout, interval)` - Wait for async condition
- `generateTestId()` - Generate unique test identifier
- `isPocketBaseAvailable(baseUrl?)` - Check if PocketBase is running
- `createMockPocketBaseError(status, message, data?)` - Create mock errors
- `assertErrorResponse(error, code?, message?)` - Assert error properties
- `retryWithBackoff(operation, maxRetries, initialDelay)` - Retry with backoff

## Environment Variables

Configure test environment with these variables:

```bash
POCKETBASE_TEST_URL=http://127.0.0.1:8090
POCKETBASE_TEST_ADMIN_EMAIL=test@example.com
POCKETBASE_TEST_ADMIN_PASSWORD=testpassword123
```

## Running Tests

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

## Property-Based Testing Guidelines

1. **Run at least 100 iterations** for each property test
2. **Tag each property test** with the design document property it validates:
   ```typescript
   // Feature: pocketbase-mcp-enhancement, Property 1: Admin authentication stores token
   ```
3. **Use appropriate generators** to constrain the input space
4. **Avoid mocks** when possible - test with real PocketBase SDK calls
5. **Write clear property statements** that express universal truths

## Integration Testing

For integration tests that require a running PocketBase instance:

1. Start PocketBase in test mode
2. Use `isPocketBaseAvailable()` to check availability
3. Use cleanup helpers in `afterEach` hooks
4. Prefix test data with `test_` for easy identification
