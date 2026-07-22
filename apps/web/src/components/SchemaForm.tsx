import { useEffect, useId, useMemo, useState } from "react";
import Form from "@rjsf/antd";
import type { RJSFSchema, UiSchema } from "@rjsf/utils";
import validatorBase, { customizeValidator } from "@rjsf/validator-ajv8";
import Ajv2020 from "ajv/dist/2020";
import { Button, Segmented, Typography, message } from "antd";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { useUi } from "../ui";

const validator = customizeValidator({ AjvClass: Ajv2020 as any }) ?? validatorBase;
type SchemaObject = Record<string, any>;
type ChoiceKey = "oneOf" | "anyOf";
const CHOICE_KEYS: ChoiceKey[] = ["oneOf", "anyOf"];

interface Props {
  schema: Record<string, unknown>;
  formData: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
  onSubmit: (data: Record<string, unknown>) => void;
  loading?: boolean;
}

const isObject = (value: unknown): value is SchemaObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const requiredFields = (schema: SchemaObject): string[] => Array.isArray(schema.required) ? schema.required.filter((item: unknown): item is string => typeof item === "string") : [];
const titleFor = (schema: SchemaObject, index: number, text: (zh: string, en: string) => string) => {
  if (typeof schema.title === "string" && schema.title.trim()) return schema.title;
  if (typeof schema.description === "string" && schema.description.trim()) return schema.description.trim();
  const required = requiredFields(schema);
  if (required.length) return text(`填写 ${required.join("、")}`, `Provide ${required.join(", ")}`);
  const properties = isObject(schema.properties) ? schema.properties : {};
  const discriminator = Object.values(properties).find((property) => isObject(property) && property.const !== undefined) as SchemaObject | undefined;
  return discriminator ? String(discriminator.const) : text(`选项 ${index + 1}`, `Option ${index + 1}`);
};

function enhanceSchema(schema: SchemaObject, text: (zh: string, en: string) => string): SchemaObject {
  const out = { ...schema };
  const parentProperties = isObject(out.properties) ? out.properties : {};
  for (const key of CHOICE_KEYS) {
    if (!Array.isArray(out[key])) continue;
    const options = out[key] as unknown[];
    const counts = new Map<string, number>();
    options.forEach((option) => { if (isObject(option)) new Set(requiredFields(option)).forEach((field) => counts.set(field, (counts.get(field) ?? 0) + 1)); });
    const controlled = new Set([...counts.entries()].filter(([field, count]) => field in parentProperties && count > 0 && count < options.length).map(([field]) => field));
    out[key] = options.map((option, index) => {
      if (!isObject(option)) return option;
      const next = { ...option };
      const explicitTitle = typeof next.title === "string" && Boolean(next.title.trim());
      const properties = isObject(next.properties) ? { ...next.properties } : {};
      requiredFields(next).forEach((field) => { if (controlled.has(field) && !(field in properties)) properties[field] = parentProperties[field]; });
      if (Object.keys(properties).length) { next.properties = properties; if (!next.type && out.type === "object") next.type = "object"; }
      const enhanced = enhanceSchema(next, text);
      if (!explicitTitle) { enhanced.title = titleFor(enhanced, index, text); if (enhanced.description === enhanced.title) delete enhanced.description; }
      return enhanced;
    });
  }
  if (isObject(out.properties)) out.properties = Object.fromEntries(Object.entries(out.properties).map(([key, value]) => [key, isObject(value) ? enhanceSchema(value, text) : value]));
  if (isObject(out.items)) out.items = enhanceSchema(out.items, text);
  if (isObject(out.$defs)) out.$defs = Object.fromEntries(Object.entries(out.$defs).map(([key, value]) => [key, isObject(value) ? enhanceSchema(value, text) : value]));
  const choice = CHOICE_KEYS.map((key) => out[key]).find(Array.isArray) as unknown[] | undefined;
  if (out.type === "object" && Object.keys(parentProperties).length === 0 && choice?.length && choice.every((option) => isObject(option) && (option.type === "object" || isObject(option.properties)))) delete out.type;
  return out;
}

function buildUiSchema(schema: SchemaObject, text: (zh: string, en: string) => string, root = true): UiSchema {
  const ui: UiSchema = root ? { "ui:submitButtonOptions": { norender: true } } : {};
  const properties = isObject(schema.properties) ? schema.properties : {};
  Object.entries(properties).forEach(([key, property]) => {
    if (!isObject(property)) return;
    const field = buildUiSchema(property, text, false);
    if (property.type === "string" && Array.isArray(property.enum)) field["ui:widget"] = "select";
    if (property.const !== undefined) field["ui:widget"] = "hidden";
    ui[key] = field;
  });
  const choiceKey = CHOICE_KEYS.find((key) => Array.isArray(schema[key]));
  if (!choiceKey) return ui;
  const options = schema[choiceKey] as SchemaObject[];
  const counts = new Map<string, number>();
  options.forEach((option) => requiredFields(option).forEach((field) => { if (field in properties && isObject(option.properties) && field in option.properties) counts.set(field, (counts.get(field) ?? 0) + 1); }));
  [...counts.entries()].filter(([, count]) => count > 0 && count < options.length).forEach(([field]) => { ui[field] = { ...((ui[field] as UiSchema) ?? {}), "ui:widget": "hidden" }; });
  ui["ui:options"] = { ...((ui["ui:options"] as Record<string, unknown>) ?? {}), enumOptions: options.map((option, index) => ({ label: titleFor(option, index, text), value: index })) } as any;
  ui[choiceKey] = options.map((option) => ({ ...buildUiSchema(option, text, false), "ui:options": { label: false } })) as any;
  return ui;
}

export function SchemaForm({ schema, formData, onChange, onSubmit, loading }: Props) {
  const { text, resolvedTheme } = useUi();
  const formId = useId();
  const [mode, setMode] = useState<"form" | "json">("form");
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const rjsfSchema = useMemo<RJSFSchema>(() => { const next = enhanceSchema(isObject(schema) ? schema : { type: "object" }, text); if (!next.type) next.type = "object"; return next as RJSFSchema; }, [schema, text]);
  const uiSchema = useMemo(() => buildUiSchema(rjsfSchema as SchemaObject, text), [rjsfSchema, text]);
  useEffect(() => { if (mode === "json") { setJsonText(JSON.stringify(formData ?? {}, null, 2)); setJsonError(null); } }, [formData, mode]);

  const parseJson = () => {
    const parsed = JSON.parse(jsonText || "{}");
    if (!isObject(parsed)) throw new Error(text("JSON 必须是对象", "JSON must be an object"));
    return parsed as Record<string, unknown>;
  };
  const switchMode = (next: "form" | "json") => {
    if (next === "json") { setJsonText(JSON.stringify(formData ?? {}, null, 2)); setJsonError(null); setMode(next); return; }
    try { onChange(parseJson()); setJsonError(null); setMode(next); } catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
  };
  const transformErrors = (errors: any[]) => errors.filter((error) => !(error.name === "required" && /\/(?:oneOf|anyOf)\/\d+\/required$/.test(String(error.schemaPath ?? "")))).map((error) => {
    const params = error.params ?? {};
    const labels: Record<string, string> = {
      required: text(`缺少必填字段：${params.missingProperty ?? ""}`, `Missing required field: ${params.missingProperty ?? ""}`),
      additionalProperties: text(`不允许额外字段：${params.additionalProperty ?? ""}`, `Unexpected field: ${params.additionalProperty ?? ""}`),
      oneOf: text("需要且只能匹配一个选项", "Must match exactly one option"),
      anyOf: text("需要匹配至少一个选项", "Must match at least one option"),
      type: text(`类型应为 ${params.type ?? ""}`, `Must be ${params.type ?? ""}`),
      minLength: text(`长度不能少于 ${params.limit ?? ""}`, `Minimum length is ${params.limit ?? ""}`),
    };
    const messageText = labels[error.name] ?? error.message;
    return { ...error, message: messageText, stack: messageText };
  });

  return <div className="schema-form-shell" onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); mode === "form" ? (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit() : (() => { try { const parsed = parseJson(); onChange(parsed); onSubmit(parsed); } catch (error) { message.error(String(error)); } })(); } }}>
    <div className="form-commandbar"><Segmented value={mode} onChange={(value) => switchMode(value as "form" | "json")} options={[{ label: text("表单", "Form"), value: "form" }, { label: "JSON", value: "json" }]} /><Button type="primary" htmlType={mode === "form" ? "submit" : "button"} form={mode === "form" ? formId : undefined} loading={loading} onClick={mode === "json" ? () => { try { const parsed = parseJson(); onChange(parsed); onSubmit(parsed); } catch (error) { message.error(error instanceof Error ? error.message : String(error)); } } : undefined}>{text("调用 Tool", "Call tool")} <kbd>⌘↵</kbd></Button></div>
    {mode === "form" ? <div className="schema-form-wrap"><Form id={formId} schema={rjsfSchema} uiSchema={uiSchema} formData={formData} validator={validator} transformErrors={transformErrors} showErrorList="top" noHtml5Validate onError={() => undefined} experimental_defaultFormStateBehavior={{ allOf: "populateDefaults", arrayMinItems: { populate: "all" }, constAsDefaults: "always", emptyObjectFields: "populateAllDefaults" }} onChange={(event) => onChange((event.formData as Record<string, unknown>) ?? {})} onSubmit={(event) => onSubmit((event.formData as Record<string, unknown>) ?? {})}><div /></Form><Typography.Paragraph type="secondary" className="form-hint">{text("复杂 oneOf / anyOf 可切换到 JSON 模式精确编辑", "Switch to JSON mode for precise oneOf / anyOf editing")}</Typography.Paragraph></div> : <div><div className="json-editor"><CodeMirror value={jsonText} height="360px" extensions={[json()]} theme={resolvedTheme === "dark" ? "dark" : "light"} onChange={(value) => { setJsonText(value); try { JSON.parse(value || "{}"); setJsonError(null); } catch (error) { setJsonError(error instanceof Error ? error.message : "Invalid JSON"); } }} /></div>{jsonError && <Typography.Text type="danger">{text("JSON 无效", "Invalid JSON")}: {jsonError}</Typography.Text>}</div>}
  </div>;
}
