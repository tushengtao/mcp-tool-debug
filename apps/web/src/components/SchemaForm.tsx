import { useMemo, useState } from "react";
import Form from "@rjsf/antd";
import type { RJSFSchema } from "@rjsf/utils";
import validatorBase from "@rjsf/validator-ajv8";
import { customizeValidator } from "@rjsf/validator-ajv8";
import Ajv2020 from "ajv/dist/2020";
import { Button, Segmented, Space, message } from "antd";
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

export function SchemaForm({ schema, formData, onChange, onSubmit, loading }: Props) {
  const [mode, setMode] = useState<"form" | "json">("form");
  const [jsonText, setJsonText] = useState("");

  const rjsfSchema = useMemo<RJSFSchema>(() => {
    const s = { ...(schema ?? { type: "object" }) } as RJSFSchema;
    if (!s.type) s.type = "object";
    return s;
  }, [schema]);

  const switchMode = (next: "form" | "json") => {
    if (next === "json") {
      setJsonText(JSON.stringify(formData ?? {}, null, 2));
    } else {
      try {
        const parsed = JSON.parse(jsonText || "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          onChange(parsed);
        } else {
          message.error("JSON 必须是对象");
          return;
        }
      } catch {
        message.error("JSON 解析失败");
        return;
      }
    }
    setMode(next);
  };

  return (
    <div>
      <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
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
            loading={loading}
            onClick={() => {
              if (mode === "json") {
                try {
                  const parsed = JSON.parse(jsonText || "{}");
                  onChange(parsed);
                  onSubmit();
                } catch {
                  message.error("JSON 解析失败");
                }
              } else {
                onSubmit();
              }
            }}
          >
            调用 Tool
          </Button>
        </Space>
      </div>

      {mode === "form" ? (
        <Form
          schema={rjsfSchema}
          formData={formData}
          validator={validator}
          liveValidate
          showErrorList="bottom"
          onChange={(e) => onChange((e.formData as Record<string, unknown>) ?? {})}
          onSubmit={() => onSubmit()}
        >
          <div />
        </Form>
      ) : (
        <div className="json-editor">
          <CodeMirror
            value={jsonText}
            height="320px"
            extensions={[json()]}
            onChange={(v) => setJsonText(v)}
          />
        </div>
      )}
    </div>
  );
}
