import { Form, Input, InputNumber, Switch, Select } from "antd";
import type { AssertConfig, TestCase } from "@mcp-debug/shared";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";

export interface CaseFormValue {
  name: string;
  description?: string;
  arguments: Record<string, unknown>;
  assert: AssertConfig;
  tags: string[];
  enabled: boolean;
}

export function caseToForm(tc?: Partial<TestCase> | null): CaseFormValue {
  return {
    name: tc?.name ?? "",
    description: tc?.description ?? "",
    arguments: tc?.arguments ?? {},
    assert: tc?.assert ?? { expectIsError: false },
    tags: tc?.tags ?? [],
    enabled: tc?.enabled ?? true,
  };
}

interface Props {
  value: CaseFormValue;
  onChange: (v: CaseFormValue) => void;
}

export function CaseEditor({ value, onChange }: Props) {
  const a = value.assert ?? {};
  return (
    <Form layout="vertical">
      <Form.Item label="名称" required>
        <Input
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </Form.Item>
      <Form.Item label="描述">
        <Input.TextArea
          rows={2}
          value={value.description}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
        />
      </Form.Item>
      <Form.Item label="Tags">
        <Select
          mode="tags"
          value={value.tags}
          onChange={(tags) => onChange({ ...value, tags })}
          placeholder="输入后回车"
        />
      </Form.Item>
      <Form.Item label="启用">
        <Switch
          checked={value.enabled}
          onChange={(enabled) => onChange({ ...value, enabled })}
        />
      </Form.Item>
      <Form.Item label="参数 arguments (JSON)">
        <div className="json-editor">
          <CodeMirror
            value={JSON.stringify(value.arguments ?? {}, null, 2)}
            height="180px"
            extensions={[json()]}
            onChange={(text) => {
              try {
                const parsed = JSON.parse(text || "{}");
                onChange({ ...value, arguments: parsed });
              } catch {
                // keep typing
              }
            }}
          />
        </div>
      </Form.Item>
      <Form.Item label="expectIsError">
        <Switch
          checked={!!a.expectIsError}
          onChange={(expectIsError) =>
            onChange({ ...value, assert: { ...a, expectIsError } })
          }
        />
      </Form.Item>
      <Form.Item label="expectStructured">
        <Switch
          checked={!!a.expectStructured}
          onChange={(expectStructured) =>
            onChange({ ...value, assert: { ...a, expectStructured } })
          }
        />
      </Form.Item>
      <Form.Item label="structuredSchemaValid">
        <Switch
          checked={!!a.structuredSchemaValid}
          onChange={(structuredSchemaValid) =>
            onChange({ ...value, assert: { ...a, structuredSchemaValid } })
          }
        />
      </Form.Item>
      <Form.Item label="maxDurationMs">
        <InputNumber
          style={{ width: "100%" }}
          value={a.maxDurationMs}
          onChange={(maxDurationMs) =>
            onChange({
              ...value,
              assert: {
                ...a,
                maxDurationMs: typeof maxDurationMs === "number" ? maxDurationMs : undefined,
              },
            })
          }
        />
      </Form.Item>
      <Form.Item label="contentTextContains (逗号分隔)">
        <Input
          value={(a.contentTextContains ?? []).join(",")}
          onChange={(e) =>
            onChange({
              ...value,
              assert: {
                ...a,
                contentTextContains: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              },
            })
          }
        />
      </Form.Item>
      <Form.Item label="structuredEquals (JSON 部分匹配)">
        <div className="json-editor">
          <CodeMirror
            value={
              a.structuredEquals === undefined
                ? ""
                : JSON.stringify(a.structuredEquals, null, 2)
            }
            height="140px"
            extensions={[json()]}
            onChange={(text) => {
              if (!text.trim()) {
                onChange({
                  ...value,
                  assert: { ...a, structuredEquals: undefined },
                });
                return;
              }
              try {
                onChange({
                  ...value,
                  assert: { ...a, structuredEquals: JSON.parse(text) },
                });
              } catch {
                // ignore
              }
            }}
          />
        </div>
      </Form.Item>
    </Form>
  );
}
