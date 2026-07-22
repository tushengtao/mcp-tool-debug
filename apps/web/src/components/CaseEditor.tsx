import { Form, Input, InputNumber, Select, Switch } from "antd";
import type { AssertConfig, TestCase } from "@mcp-debug/shared";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { useUi } from "../ui";

export interface CaseFormValue {
  name: string;
  description?: string;
  arguments: Record<string, unknown>;
  assert: AssertConfig;
  tags: string[];
  enabled: boolean;
}

export function caseToForm(testCase?: Partial<TestCase> | null): CaseFormValue {
  return { name: testCase?.name ?? "", description: testCase?.description ?? "", arguments: testCase?.arguments ?? {}, assert: testCase?.assert ?? { expectIsError: false }, tags: testCase?.tags ?? [], enabled: testCase?.enabled ?? true };
}

export function CaseEditor({ value, onChange }: { value: CaseFormValue; onChange: (value: CaseFormValue) => void }) {
  const { text, resolvedTheme } = useUi();
  const assertions = value.assert ?? {};
  const updateAssert = (patch: Partial<AssertConfig>) => onChange({ ...value, assert: { ...assertions, ...patch } });
  const editorTheme = resolvedTheme === "dark" ? "dark" : "light";
  return <Form layout="vertical" className="case-editor">
    <div className="form-grid-2">
      <Form.Item label={text("名称", "Name")} required><Input value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} /></Form.Item>
      <Form.Item label="Tags"><Select mode="tags" value={value.tags} onChange={(tags) => onChange({ ...value, tags })} placeholder={text("输入后回车", "Type and press Enter")} /></Form.Item>
    </div>
    <Form.Item label={text("描述", "Description")}><Input.TextArea rows={2} value={value.description} onChange={(event) => onChange({ ...value, description: event.target.value })} /></Form.Item>
    <Form.Item label={text("启用", "Enabled")}><Switch checked={value.enabled} onChange={(enabled) => onChange({ ...value, enabled })} /></Form.Item>
    <Form.Item label="arguments (JSON)"><div className="json-editor"><CodeMirror value={JSON.stringify(value.arguments ?? {}, null, 2)} height="180px" extensions={[json()]} theme={editorTheme} onChange={(source) => { try { onChange({ ...value, arguments: JSON.parse(source || "{}") }); } catch { /* keep editing */ } }} /></div></Form.Item>
    <div className="assertion-grid">
      <Form.Item label="expectIsError"><Switch checked={Boolean(assertions.expectIsError)} onChange={(expectIsError) => updateAssert({ expectIsError })} /></Form.Item>
      <Form.Item label="expectStructured"><Switch checked={Boolean(assertions.expectStructured)} onChange={(expectStructured) => updateAssert({ expectStructured })} /></Form.Item>
      <Form.Item label="structuredSchemaValid"><Switch checked={Boolean(assertions.structuredSchemaValid)} onChange={(structuredSchemaValid) => updateAssert({ structuredSchemaValid })} /></Form.Item>
      <Form.Item label="maxDurationMs"><InputNumber style={{ width: "100%" }} value={assertions.maxDurationMs} onChange={(maxDurationMs) => updateAssert({ maxDurationMs: typeof maxDurationMs === "number" ? maxDurationMs : undefined })} /></Form.Item>
    </div>
    <Form.Item label={text("contentTextContains（逗号分隔）", "contentTextContains (comma separated)")}><Input value={(assertions.contentTextContains ?? []).join(",")} onChange={(event) => updateAssert({ contentTextContains: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></Form.Item>
    <Form.Item label={text("structuredEquals（JSON 部分匹配）", "structuredEquals (partial JSON match)")}><div className="json-editor"><CodeMirror value={assertions.structuredEquals === undefined ? "" : JSON.stringify(assertions.structuredEquals, null, 2)} height="140px" extensions={[json()]} theme={editorTheme} onChange={(source) => { if (!source.trim()) updateAssert({ structuredEquals: undefined }); else try { updateAssert({ structuredEquals: JSON.parse(source) }); } catch { /* keep editing */ } }} /></div></Form.Item>
  </Form>;
}
