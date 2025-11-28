/**
 * Property-based testing generators for PocketBase data types
 * Using fast-check library for generating test data
 */

import * as fc from "fast-check";

/**
 * Generate valid email addresses
 */
export const emailArbitrary = (): fc.Arbitrary<string> => {
  return fc
    .tuple(fc.stringMatching(/^[a-z0-9]+$/), fc.stringMatching(/^[a-z0-9]+$/), fc.stringMatching(/^[a-z]{2,6}$/))
    .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);
};

/**
 * Generate strong passwords (min 8 chars, with letters and numbers)
 */
export const passwordArbitrary = (): fc.Arbitrary<string> => {
  return fc.string({ minLength: 8, maxLength: 32 }).filter((s) => /[a-zA-Z]/.test(s) && /[0-9]/.test(s));
};

/**
 * Generate valid collection names (alphanumeric with underscores, no spaces)
 */
export const collectionNameArbitrary = (): fc.Arbitrary<string> => {
  return fc.stringMatching(/^[a-z][a-z0-9_]{2,30}$/).filter((s) => !s.startsWith("_") && !s.endsWith("_"));
};

/**
 * Generate valid field names for schemas
 */
export const fieldNameArbitrary = (): fc.Arbitrary<string> => {
  return fc.stringMatching(/^[a-z][a-z0-9_]{1,20}$/);
};

/**
 * Generate PocketBase field types
 */
export const fieldTypeArbitrary = (): fc.Arbitrary<string> => {
  return fc.constantFrom("text", "number", "bool", "email", "url", "date", "select", "file", "relation", "json");
};

/**
 * Generate schema field definitions
 */
export const schemaFieldArbitrary = (): fc.Arbitrary<{
  id: string;
  name: string;
  type: string;
  required: boolean;
  options?: Record<string, any>;
}> => {
  return fc.record({
    id: fc.uuid(),
    name: fieldNameArbitrary(),
    type: fieldTypeArbitrary(),
    required: fc.boolean(),
    options: fc.option(fc.dictionary(fc.string(), fc.anything()), {
      nil: undefined,
    }),
  });
};

/**
 * Generate collection types
 */
export const collectionTypeArbitrary = (): fc.Arbitrary<"base" | "auth" | "view"> => {
  return fc.constantFrom("base", "auth", "view");
};

/**
 * Generate filter expressions (simplified PocketBase filter syntax)
 */
export const filterExpressionArbitrary = (): fc.Arbitrary<string> => {
  return fc.oneof(
    fc.constant(""),
    fc
      .tuple(fieldNameArbitrary(), fc.constantFrom("=", "!=", ">", "<", ">=", "<="), fc.string())
      .map(([field, op, value]) => `${field} ${op} "${value}"`),
    fc.tuple(fieldNameArbitrary(), fc.integer()).map(([field, value]) => `${field} = ${value}`)
  );
};

/**
 * Generate sort parameters
 */
export const sortParameterArbitrary = (): fc.Arbitrary<string> => {
  return fc.tuple(fc.constantFrom("+", "-"), fieldNameArbitrary()).map(([direction, field]) => `${direction}${field}`);
};

/**
 * Generate pagination parameters
 */
export const paginationArbitrary = (): fc.Arbitrary<{
  page: number;
  perPage: number;
}> => {
  return fc.record({
    page: fc.integer({ min: 1, max: 100 }),
    perPage: fc.integer({ min: 1, max: 100 }),
  });
};

/**
 * Generate record data matching a simple schema
 */
export const recordDataArbitrary = (fields: string[] = ["name", "description"]): fc.Arbitrary<Record<string, any>> => {
  const fieldArbitraries: Record<string, fc.Arbitrary<any>> = {};

  for (const field of fields) {
    fieldArbitraries[field] = fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null));
  }

  return fc.record(fieldArbitraries);
};

/**
 * Generate valid URLs
 */
export const urlArbitrary = (): fc.Arbitrary<string> => {
  return fc
    .tuple(
      fc.constantFrom("http", "https"),
      fc.stringMatching(/^[a-z0-9-]+$/),
      fc.stringMatching(/^[a-z]{2,6}$/),
      fc.option(fc.integer({ min: 1000, max: 9999 }), { nil: undefined })
    )
    .map(([protocol, domain, tld, port]) => {
      const base = `${protocol}://${domain}.${tld}`;
      return port ? `${base}:${port}` : base;
    });
};

/**
 * Generate user data for user creation
 */
export const userDataArbitrary = (): fc.Arbitrary<{
  email: string;
  password: string;
  passwordConfirm: string;
  emailVisibility?: boolean;
  verified?: boolean;
}> => {
  return fc
    .tuple(emailArbitrary(), passwordArbitrary(), fc.boolean(), fc.boolean())
    .map(([email, password, emailVisibility, verified]) => ({
      email,
      password,
      passwordConfirm: password,
      emailVisibility,
      verified,
    }));
};
