import { useEffect, useMemo, useState } from "react";
import Form from "@rjsf/antd";
import type { RJSFSchema, UiSchema } from "@rjsf/utils";
import validatorBase from "@rjsf/validator-ajv8";
import { customizeValidator } from "@rjsf/validator-ajv8";
import Ajv2020 from "ajv/dist/2020";
import { Button, Segmented, Space, Typography, message } from "antd";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";

const validator = customizeValidator({ AjvClass: Ajv2020 as any }) ?? validatorBase;

interface Props {
  schema: Record<string, unknown>;
  formData: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
  onSubmit: () => void;
  loading?: boolean;
}

/** Improve oneOf/anyOf option labels for RJSF select */
function enhanceSchema(schema: Record<string, unknown>): Record<string, unknown> {
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = Array.isArray(schema) ? [...(schema as unknown[])] as any : { ...schema };

  const labelOneOf = (items: unknown[]): unknown[] =>
    items.map((item, idx) => {
      if (!item || typeof item !== "object") return item;
      const obj = enhanceSchema(item as Record<string, unknown>);
      // RJSF uses title as option label for oneOf/anyOf. Set it from description or const type.
      if (!obj.title) {
        const desc = typeof obj.description === "string" ? obj.description : "";
        const constType =
          obj.properties &&
          typeof obj.properties === "object" &&
          (obj.properties as any).type &&
          typeof (obj.properties as any).type === "object" &&
          (obj.properties as any).type.const;
        obj.title = desc || (constType ? String(constType) : `选项 ${idx + 1}`);
      }
      return obj;
    });

  if (Array.isArray(out.oneOf)) out.oneOf = labelOneOf(out.oneOf as unknown[]);
  if (Array.isArray(out.anyOf)) out.anyOf = labelOneOf(out.anyOf as unknown[]);

  if (out.properties && typeof out.properties === "object") {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(out.properties as Record<string, unknown>)) {
      props[k] =
        v && typeof v === "object" ? enhanceSchema(v as Record<string, unknown>) : v;
    }
    out.properties = props;
  }

  if (out.items && typeof out.items === "object" && !Array.isArray(out.items)) {
    out.items = enhanceSchema(out.items as Record<string, unknown>);
  }

  return out;
}

function buildUiSchema(schema: Record<string, unknown>): UiSchema {
  const ui: UiSchema = {
    "ui:submitButtonOptions": { norender: true },
  };
  const props = schema.properties as Record<string, any> | undefined;
  if (!props) return ui;
  for (const [key, prop] of Object.entries(props)) {
    if (!prop || typeof prop !== "object") continue;
    const field: UiSchema = {};
    if (prop.oneOf || prop.anyOf) {
      field["ui:options"] = { label: true };
      // Hide the field-level title for oneOf/anyOf to avoid duplicate with option labels
      field["ui:title"] = " ";
    }
    if (prop.type === "string" && prop.enum) {
      field["ui:widget"] = "select";
    }
    ui[key] = field;
  }
  return ui;
}

/** Translate common Ajv error messages to concise Chinese */
function transformErrors(errors: any[]): any[] {
  return errors.map((err) => {
    const msg = String(err.message ?? "");
    const name = err.name;
    const params = err.params ?? {};
    let friendly = msg;

    if (name === "required") {
      friendly = `缺少必填字段：${params.missingProperty ?? ""}`;
    } else if (name === "additionalProperties") {
      friendly = `不允许额外字段：${params.additionalProperty ?? ""}`;
    } else if (name === "const") {
      friendly = `值必须为常量：${params.allowedValue ?? ""}`;
    } else if (name === "enum") {
      friendly = `值不在允许范围内`;
    } else if (name === "oneOf") {
      friendly = `需匹配且仅匹配一个选项`;
    } else if (name === "anyOf") {
      friendly = `需匹配至少一个选项`;
    } else if (name === "type") {
      friendly = `类型应为 ${params.type ?? ""}`;
    } else if (name === "minimum") {
      friendly = `不能小于 ${params.limit ?? ""}`;
    } else if (name === "maximum") {
      friendly = `不能大于 ${params.limit ?? ""}`;
    } else if (name === "minLength") {
      friendly = `长度不能少于 ${params.limit ?? ""}`;
    } else if (name === "maxLength") {
      friendly = `长度不能超过 ${params.limit ?? ""}`;
    } else if (name === "pattern") {
      friendly = `格式不正确`;
    }

    return {
      ...err,
      message: friendly,
      stack: friendly,
    };
  });
}

export function SchemaForm({ schema, formData, onChange, onSubmit, loading }: Props) {
  const [mode, setMode] = useState<"form" | "json">("form");
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const rjsfSchema = useMemo<RJSFSchema>(() => {
    const enhanced = enhanceSchema(schema ?? { type: "object" });
    const s = { ...enhanced } as RJSFSchema;
    if (!s.type) s.type = "object";
    return s;
  }, [schema]);

  const uiSchema = useMemo(() => buildUiSchema(rjsfSchema as Record<string, unknown>), [rjsfSchema]);

  useEffect(() => {
    if (mode === "json") {
      setJsonText(JSON.stringify(formData ?? {}, null, 2));
      setJsonError(null);
    }
  }, [formData, mode]);

  const switchMode = (next: "form" | "json") => {
    if (next === "json") {
      setJsonText(JSON.stringify(formData ?? {}, null, 2));
      setJsonError(null);
    } else {
      try {
        const parsed = JSON.parse(jsonText || "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          onChange(parsed);
          setJsonError(null);
        } else {
          message.error("JSON 必须是对象");
          return;
        }
      } catch {
        message.error("JSON 解析失败，请修正后再切回表单");
        return;
      }
    }
    setMode(next);
  };

  const handleInvoke = () => {
    if (mode === "json") {
      try {
        const parsed = JSON.parse(jsonText || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          message.error("JSON 必须是对象");
          return;
        }
        onChange(parsed);
        onSubmit();
      } catch {
        message.error("JSON 解析失败");
      }
    } else {
      onSubmit();
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Segmented
          value={mode}
          onChange={(v) => switchMode(v as "form" | "json")}
          options={[
            { label: "表单", value: "form" },
            { label: "JSON", value: "json" },
          ]}
        />
        <Space>
          <Button type="primary" loading={loading} onClick={handleInvoke}>
            调用 Tool
          </Button>
        </Space>
      </div>

      {mode === "form" ? (
        <div className="schema-form-wrap">
          <Form
            schema={rjsfSchema}
            uiSchema={uiSchema}
            formData={formData}
            validator={validator}
            transformErrors={transformErrors}
            showErrorList={false}
            noHtml5Validate
            experimental_defaultFormStateBehavior={{
              allOf: "populateDefaults",
              arrayMinItems: { populate: "all" },
              emptyObjectFields: "populateAllDefaults",
            }}
            onChange={(e) => onChange((e.formData as Record<string, unknown>) ?? {})}
            onSubmit={() => onSubmit()}
          >
            <div />
          </Form>
          <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
            复杂 oneOf 字段可切换到 JSON 模式精确编辑
          </Typography.Paragraph>
        </div>
      ) : (
        <div>
          <div className="json-editor">
            <CodeMirror
              value={jsonText}
              height="320px"
              extensions={[json()]}
              onChange={(v) => {
                setJsonText(v);
                try {
                  JSON.parse(v || "{}");
                  setJsonError(null);
                } catch (e) {
                  setJsonError(e instanceof Error ? e.message : "invalid json");
                }
              }}
            />
          </div>
          {jsonError ? (
            <Typography.Text type="danger" style={{ fontSize: 12 }}>
              JSON 无效：{jsonError}
            </Typography.Text>
          ) : null}
        </div>
      )}
    </div>
  );
}
