import type {
  AssertConfig,
  AssertResult,
  ContentItem,
  SchemaValidationResult,
} from "@mcp-debug/shared";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Partial deep match (lodash isMatch-like) */
export function isMatch(object: unknown, source: unknown): boolean {
  if (source === object) return true;
  if (Array.isArray(source)) {
    if (!Array.isArray(object)) return false;
    return source.every((item, i) => isMatch(object[i], item));
  }
  if (isObject(source)) {
    if (!isObject(object)) return false;
    return Object.keys(source).every((key) => isMatch(object[key], source[key]));
  }
  return false;
}

function contentText(content: ContentItem[]): string {
  return content
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n");
}

function getByPath(data: unknown, path: string): unknown {
  if (!path || path === "$") return data;
  const normalized = path.startsWith("$.")
    ? path.slice(2)
    : path.startsWith("$")
      ? path.slice(1)
      : path;
  if (!normalized) return data;
  const parts = normalized.split(".").filter(Boolean);
  let cur: unknown = data;
  for (const part of parts) {
    const m = part.match(/^([^\[\]]+)(?:\[(\d+)\])?$/);
    if (!m) return undefined;
    const key = m[1];
    const idx = m[2];
    if (!isObject(cur) && !Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[key];
    if (idx !== undefined) {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[Number(idx)];
    }
  }
  return cur;
}

export function evaluateAssert(input: {
  assert: AssertConfig;
  isError: boolean;
  content: ContentItem[];
  structuredContent?: unknown;
  durationMs: number;
  schemaValidation?: SchemaValidationResult | null;
}): AssertResult {
  const checks: AssertResult["checks"] = [];
  const { assert } = input;

  if (assert.expectIsError !== undefined) {
    const passed = input.isError === assert.expectIsError;
    checks.push({
      name: "expectIsError",
      passed,
      expected: assert.expectIsError,
      actual: input.isError,
      message: passed ? undefined : `expected isError=${assert.expectIsError}`,
    });
  }

  if (assert.expectStructured !== undefined) {
    const has = input.structuredContent !== undefined && input.structuredContent !== null;
    const passed = has === assert.expectStructured;
    checks.push({
      name: "expectStructured",
      passed,
      expected: assert.expectStructured,
      actual: has,
      message: passed ? undefined : `expected structuredContent present=${assert.expectStructured}`,
    });
  }

  if (assert.structuredEquals !== undefined) {
    const passed = isMatch(input.structuredContent, assert.structuredEquals);
    checks.push({
      name: "structuredEquals",
      passed,
      expected: assert.structuredEquals,
      actual: input.structuredContent,
      message: passed ? undefined : "structuredContent does not match expected partial object",
    });
  }

  if (assert.structuredSchemaValid) {
    const ok = input.schemaValidation?.ok === true;
    checks.push({
      name: "structuredSchemaValid",
      passed: ok,
      expected: true,
      actual: input.schemaValidation,
      message: ok ? undefined : "structuredContent failed outputSchema validation",
    });
  }

  const text = contentText(input.content);
  for (const s of assert.contentTextContains ?? []) {
    const passed = text.includes(s);
    checks.push({
      name: "contentTextContains",
      passed,
      expected: s,
      actual: text.slice(0, 500),
      message: passed ? undefined : `content text missing: ${s}`,
    });
  }
  for (const s of assert.contentTextNotContains ?? []) {
    const passed = !text.includes(s);
    checks.push({
      name: "contentTextNotContains",
      passed,
      expected: s,
      actual: text.slice(0, 500),
      message: passed ? undefined : `content text should not contain: ${s}`,
    });
  }

  if (typeof assert.maxDurationMs === "number") {
    const passed = input.durationMs <= assert.maxDurationMs;
    checks.push({
      name: "maxDurationMs",
      passed,
      expected: assert.maxDurationMs,
      actual: input.durationMs,
      message: passed
        ? undefined
        : `duration ${input.durationMs}ms exceeded ${assert.maxDurationMs}ms`,
    });
  }

  for (const item of assert.jsonPathEquals ?? []) {
    const actual = getByPath(input.structuredContent, item.path);
    const passed = JSON.stringify(actual) === JSON.stringify(item.value);
    checks.push({
      name: "jsonPathEquals",
      passed,
      expected: { path: item.path, value: item.value },
      actual,
      message: passed ? undefined : `path ${item.path} mismatch`,
    });
  }

  return {
    passed: checks.every((c) => c.passed),
    checks,
  };
}
