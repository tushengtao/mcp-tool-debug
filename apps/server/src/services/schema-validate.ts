import Ajv2020Pkg from "ajv/dist/2020.js";
import addFormatsPkg from "ajv-formats";
import type { ErrorObject, SchemaValidationResult } from "@mcp-debug/shared";

const Ajv2020 = Ajv2020Pkg as unknown as new (opts: {
  allErrors?: boolean;
  strict?: boolean;
}) => {
  compile: (schema: Record<string, unknown>) => {
    (data: unknown): boolean;
    errors?: ErrorObject[] | null;
  };
};
const addFormats = addFormatsPkg as unknown as (
  ajv: ReturnType<typeof Ajv2020.prototype.compile> | any,
) => void;

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

interface ValidateError {
  instancePath?: string;
  schemaPath?: string;
  message?: string;
}

export function validateAgainstSchema(
  schema: Record<string, unknown> | null | undefined,
  data: unknown,
): SchemaValidationResult {
  if (!schema) {
    return { ok: true, errors: [] };
  }
  if (data === undefined) {
    return {
      ok: false,
      errors: [{ path: "", message: "structuredContent is missing" }],
    };
  }
  try {
    const validate = ajv.compile(schema);
    const ok = validate(data);
    if (ok) return { ok: true, errors: [] };
    const errors = ((validate.errors ?? []) as ValidateError[]).map((e) => ({
      path: e.instancePath || e.schemaPath || "",
      message: e.message ?? "validation error",
    }));
    return { ok: false, errors };
  } catch (err) {
    return {
      ok: false,
      errors: [
        {
          path: "",
          message: err instanceof Error ? err.message : "schema compile failed",
        },
      ],
    };
  }
}
