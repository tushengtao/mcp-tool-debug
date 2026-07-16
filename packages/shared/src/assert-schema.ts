import type { AssertConfig } from "./types.js";

export const emptyAssert = (): AssertConfig => ({
  expectIsError: false,
  structuredSchemaValid: false,
  contentTextContains: [],
  contentTextNotContains: [],
  jsonPathEquals: [],
});

export function normalizeAssert(input?: AssertConfig | null): AssertConfig {
  const base = emptyAssert();
  if (!input || typeof input !== "object") return base;
  return {
    expectIsError: input.expectIsError,
    expectStructured: input.expectStructured,
    structuredEquals: input.structuredEquals,
    structuredSchemaValid: input.structuredSchemaValid,
    contentTextContains: Array.isArray(input.contentTextContains)
      ? input.contentTextContains
      : [],
    contentTextNotContains: Array.isArray(input.contentTextNotContains)
      ? input.contentTextNotContains
      : [],
    maxDurationMs:
      typeof input.maxDurationMs === "number" ? input.maxDurationMs : undefined,
    jsonPathEquals: Array.isArray(input.jsonPathEquals)
      ? input.jsonPathEquals
      : [],
  };
}
