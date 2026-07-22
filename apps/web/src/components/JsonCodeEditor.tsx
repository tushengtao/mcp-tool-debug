import { useEffect, useState } from "react";
import { Button, Tooltip, message } from "antd";
import { CopyOutlined } from "@ant-design/icons";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { useUi } from "../ui";

interface JsonCodeEditorProps {
  value: string;
  height: string;
  editable?: boolean;
  onChange?: (value: string) => void;
}

export function JsonCodeEditor({ value, height, editable = true, onChange }: JsonCodeEditorProps) {
  const { text, resolvedTheme } = useUi();
  const [source, setSource] = useState(value);
  const [messageApi, messageContext] = message.useMessage();

  useEffect(() => setSource(value), [value]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source);
      messageApi.success(text("JSON 已复制", "JSON copied"));
    } catch {
      messageApi.error(text("复制失败，请手动选择内容", "Copy failed; select the content manually"));
    }
  };

  const copyLabel = text("复制 JSON", "Copy JSON");

  return (
    <div className="json-editor">
      {messageContext}
      <div className="json-editor-toolbar">
        <span>JSON</span>
        <Tooltip title={copyLabel}>
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            aria-label={copyLabel}
            onClick={() => void copy()}
          >
            {text("复制", "Copy")}
          </Button>
        </Tooltip>
      </div>
      <CodeMirror
        value={source}
        height={height}
        extensions={[json()]}
        editable={editable}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        onChange={(next) => {
          setSource(next);
          onChange?.(next);
        }}
      />
    </div>
  );
}
