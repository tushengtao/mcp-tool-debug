import { useEffect, useId, useMemo, useState } from "react";
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
  onSubmit: (data: Record<string, unknown>) => void;
  loading?: boolean;
}

type SchemaObject = Record<string, any>;
type ChoiceKey = "oneOf" | "anyOf";

const CHOICE_KEYS: ChoiceKey[] = ["oneOf", "anyOf"];

function isSchemaObject(value: unknown): value is SchemaObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredFields(schema: SchemaObject): string[] {
  return Array.isArray(schema.required)
    ? schema.required.filter((field: unknown): field is string => typeof field === "string")
    : [];
}

function choiceTitle(schema: SchemaObject, index: number): string {
  if (typeof schema.title === "string" && schema.title.trim()) return schema.title;
  if (typeof schema.description === "string" && schema.description.trim()) {
    return schema.description.trim();
  }

  const required = requiredFields(schema);
  if (required.length) return `填写 ${required.join("、")}`;

  const properties = isSchemaObject(schema.properties) ? schema.properties : {};
  const constProperty = Object.values(properties).find(
    (property) => isSchemaObject(property) && property.const !== undefined,
  ) as SchemaObject | undefined;
  return constProperty ? String(constProperty.const) : `选项 ${index + 1}`;
}

/**
 * RJSF 会先渲染对象自身的 properties，再在底部渲染 oneOf/anyOf 选择器。
 * 对于 MCP 常见的“父级定义字段、分支只写 required”模式，把对应字段定义复制到分支中，
 * 让分支选择器能够真正控制要显示的字段。这里只构造表单用 Schema，不修改 Tool 原始 Schema。
 */
function enhanceSchema(schema: Record<string, unknown>): Record<string, unknown> {
  if (!isSchemaObject(schema)) return schema;
  const out: SchemaObject = { ...schema };
  const parentProperties = isSchemaObject(out.properties) ? out.properties : {};

  for (const choiceKey of CHOICE_KEYS) {
    if (!Array.isArray(out[choiceKey])) continue;

    const options = out[choiceKey] as unknown[];
    const requiredCounts = new Map<string, number>();
    for (const option of options) {
      if (!isSchemaObject(option)) continue;
      for (const field of new Set(requiredFields(option))) {
        requiredCounts.set(field, (requiredCounts.get(field) ?? 0) + 1);
      }
    }

    // 只提升“部分分支要求、且父级已经定义”的字段；所有分支共有的字段仍作为公共字段显示。
    const branchControlledFields = new Set(
      [...requiredCounts.entries()]
        .filter(([field, count]) => field in parentProperties && count > 0 && count < options.length)
        .map(([field]) => field),
    );

    out[choiceKey] = options.map((option, index) => {
      if (!isSchemaObject(option)) return option;
      const optionSchema: SchemaObject = { ...option };
      const hadExplicitTitle =
        typeof optionSchema.title === "string" && Boolean(optionSchema.title.trim());
      const optionProperties = isSchemaObject(optionSchema.properties)
        ? { ...optionSchema.properties }
        : {};

      for (const field of requiredFields(optionSchema)) {
        if (branchControlledFields.has(field) && !(field in optionProperties)) {
          optionProperties[field] = parentProperties[field];
        }
      }

      if (Object.keys(optionProperties).length) {
        optionSchema.properties = optionProperties;
        if (!optionSchema.type && out.type === "object") optionSchema.type = "object";
      }

      const enhancedOption = enhanceSchema(optionSchema) as SchemaObject;
      if (!hadExplicitTitle) {
        enhancedOption.title = choiceTitle(enhancedOption, index);
        // description 已经作为选择项名称展示，分支展开后无需再重复一遍。
        if (
          typeof enhancedOption.description === "string" &&
          enhancedOption.description.trim() === enhancedOption.title
        ) {
          delete enhancedOption.description;
        }
      }
      return enhancedOption;
    });
  }

  if (isSchemaObject(out.properties)) {
    out.properties = Object.fromEntries(
      Object.entries(out.properties).map(([key, property]) => [
        key,
        isSchemaObject(property) ? enhanceSchema(property) : property,
      ]),
    );
  }

  if (isSchemaObject(out.items)) out.items = enhanceSchema(out.items);
  if (isSchemaObject(out.$defs)) {
    out.$defs = Object.fromEntries(
      Object.entries(out.$defs).map(([key, definition]) => [
        key,
        isSchemaObject(definition) ? enhanceSchema(definition) : definition,
      ]),
    );
  }

  // 没有公共 properties 的对象 choice 不需要先渲染一个空 ObjectField。
  // 各分支已经具备 object 类型，移除表单派生 Schema 的父级 type 后由 MultiSchemaField 独立渲染。
  const objectChoice = CHOICE_KEYS.map((key) => out[key])
    .find((options) => Array.isArray(options)) as unknown[] | undefined;
  if (
    out.type === "object" &&
    Object.keys(parentProperties).length === 0 &&
    objectChoice?.length &&
    objectChoice.every(
      (option) =>
        isSchemaObject(option) &&
        (option.type === "object" || isSchemaObject(option.properties)),
    )
  ) {
    delete out.type;
  }

  return out;
}

function findChoice(schema: SchemaObject): { key: ChoiceKey; options: SchemaObject[] } | null {
  for (const key of CHOICE_KEYS) {
    if (Array.isArray(schema[key]) && schema[key].every(isSchemaObject)) {
      return { key, options: schema[key] };
    }
  }
  return null;
}

function branchControlledFields(schema: SchemaObject, options: SchemaObject[]): Set<string> {
  const parentProperties = isSchemaObject(schema.properties) ? schema.properties : {};
  const counts = new Map<string, number>();

  for (const option of options) {
    const optionProperties = isSchemaObject(option.properties) ? option.properties : {};
    for (const field of requiredFields(option)) {
      if (field in parentProperties && field in optionProperties) {
        counts.set(field, (counts.get(field) ?? 0) + 1);
      }
    }
  }

  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count > 0 && count < options.length)
      .map(([field]) => field),
  );
}

function buildUiSchema(schema: SchemaObject, root = true): UiSchema {
  const ui: UiSchema = root
    ? { "ui:submitButtonOptions": { norender: true } }
    : {};
  const properties = isSchemaObject(schema.properties) ? schema.properties : {};

  for (const [key, property] of Object.entries(properties)) {
    if (!isSchemaObject(property)) continue;
    const field = buildUiSchema(property, false);
    if (property.type === "string" && Array.isArray(property.enum)) {
      field["ui:widget"] = "select";
    }
    // const 通常是 oneOf 的内部判别值，选择分支时由 RJSF 自动写入，无需让用户重复填写。
    if (property.const !== undefined) field["ui:widget"] = "hidden";
    ui[key] = field;
  }

  const choice = findChoice(schema);
  if (!choice) return ui;

  const controlledFields = branchControlledFields(schema, choice.options);
  for (const fieldName of controlledFields) {
    const field = (ui[fieldName] ?? {}) as UiSchema;
    field["ui:widget"] = "hidden";
    ui[fieldName] = field;
  }

  const enumOptions = choice.options.map((option, index) => ({
    label: choiceTitle(option, index),
    value: index,
  }));
  ui["ui:options"] = {
    ...((ui["ui:options"] as Record<string, unknown> | undefined) ?? {}),
    label: true,
    enumOptions,
  } as any;
  ui[choice.key] = choice.options.map((option) => {
    const optionUi = buildUiSchema(option, false);
    optionUi["ui:options"] = {
      ...((optionUi["ui:options"] as Record<string, unknown> | undefined) ?? {}),
      label: false,
    } as any;
    return optionUi;
  }) as any;

  return ui;
}

/** Translate common Ajv error messages to concise Chinese */
function transformErrors(errors: any[]): any[] {
  return errors
    .filter((err) => {
      const schemaPath = String(err.schemaPath ?? "");
      // Ajv 会同时返回每个失败分支的 required 和最终 anyOf/oneOf 错误；摘要仅保留聚合提示。
      return !(
        err.name === "required" &&
        /\/(?:oneOf|anyOf)\/\d+\/required$/.test(schemaPath)
      );
    })
    .map((err) => {
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
  const formId = useId();
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

  const handleJsonInvoke = () => {
    try {
      const parsed = JSON.parse(jsonText || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        message.error("JSON 必须是对象");
        return;
      }
      onChange(parsed);
      onSubmit(parsed);
    } catch {
      message.error("JSON 解析失败");
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
          <Button
            type="primary"
            htmlType={mode === "form" ? "submit" : "button"}
            form={mode === "form" ? formId : undefined}
            loading={loading}
            onClick={mode === "json" ? handleJsonInvoke : undefined}
          >
            调用 Tool
          </Button>
        </Space>
      </div>

      {mode === "form" ? (
        <div className="schema-form-wrap">
          <Form
            id={formId}
            schema={rjsfSchema}
            uiSchema={uiSchema}
            formData={formData}
            validator={validator}
            transformErrors={transformErrors}
            showErrorList="top"
            noHtml5Validate
            experimental_defaultFormStateBehavior={{
              allOf: "populateDefaults",
              arrayMinItems: { populate: "all" },
              constAsDefaults: "always",
              emptyObjectFields: "populateAllDefaults",
            }}
            onChange={(e) => onChange((e.formData as Record<string, unknown>) ?? {})}
            onSubmit={(event) =>
              onSubmit((event.formData as Record<string, unknown>) ?? {})
            }
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
