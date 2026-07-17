import { useMemo } from "react";
import { Alert, Empty, Tabs, Tag, Typography } from "antd";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  AssertResult,
  ContentItem,
  InvokeResponse,
  SchemaValidationResult,
} from "@mcp-debug/shared";
import { TimingBar } from "./TimingBar";

function contentText(content: ContentItem[] = []): string {
  return content
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n");
}

function extractErrorMessage(result: Partial<InvokeResponse>): string | null {
  if (result.protocolError) {
    const m = (result.protocolError as any).message;
    return typeof m === "string" ? m : JSON.stringify(result.protocolError);
  }
  const sc = result.structuredContent as any;
  if (sc && typeof sc === "object") {
    if (typeof sc.error === "string") return sc.error;
    if (typeof sc.message === "string") return sc.message;
    if (sc.raw_response?.msg) return String(sc.raw_response.msg);
    if (sc.msg) return String(sc.msg);
  }
  const text = contentText(result.content ?? []);
  if (text && (result.isError || result.status === "tool_error")) return text;
  return null;
}

function ContentBlocks({ content }: { content: ContentItem[] }) {
  if (!content?.length) return <Empty description="无非结构化 content" />;
  return (
    <>
      {content.map((item, idx) => {
        if (item.type === "text") {
          return (
            <div className="content-block" key={idx}>
              <div className="meta">text</div>
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {item.text ?? ""}
                </ReactMarkdown>
              </div>
            </div>
          );
        }
        if (item.type === "image" && item.data) {
          return (
            <div className="content-block" key={idx}>
              <div className="meta">image · {item.mimeType}</div>
              <img
                alt="tool-image"
                style={{ maxWidth: "100%", borderRadius: 8 }}
                src={`data:${item.mimeType || "image/png"};base64,${item.data}`}
              />
            </div>
          );
        }
        if (item.type === "audio" && item.data) {
          return (
            <div className="content-block" key={idx}>
              <div className="meta">audio · {item.mimeType}</div>
              <audio
                controls
                src={`data:${item.mimeType || "audio/wav"};base64,${item.data}`}
              />
            </div>
          );
        }
        if (item.type === "resource_link") {
          return (
            <div className="content-block" key={idx}>
              <div className="meta">resource_link</div>
              <div>
                <strong>{item.name ?? item.uri}</strong>
                <div className="muted">{item.uri}</div>
                <div>{item.description}</div>
              </div>
            </div>
          );
        }
        return (
          <div className="content-block" key={idx}>
            <div className="meta">{item.type || "unknown"}</div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(item, null, 2)}
            </pre>
          </div>
        );
      })}
    </>
  );
}

function SchemaBadge({ validation }: { validation?: SchemaValidationResult | null }) {
  if (!validation) return <Tag>无 outputSchema 校验</Tag>;
  return validation.ok ? (
    <Tag color="success">outputSchema 校验通过</Tag>
  ) : (
    <Tag color="error">outputSchema 校验失败</Tag>
  );
}

function AssertPanel({ result }: { result?: AssertResult | null }) {
  if (!result) return <Empty description="无断言结果" />;
  return (
    <div>
      <Tag color={result.passed ? "success" : "error"}>
        {result.passed ? "断言通过" : "断言失败"}
      </Tag>
      <ul>
        {result.checks.map((c, i) => (
          <li key={i}>
            <Tag color={c.passed ? "success" : "error"}>{c.name}</Tag>
            {c.message || (c.passed ? "ok" : "failed")}
          </li>
        ))}
      </ul>
    </div>
  );
}

function JsonPane({ value, height = "360px" }: { value: unknown; height?: string }) {
  return (
    <div className="json-editor">
      <CodeMirror
        value={JSON.stringify(value, null, 2)}
        height={height}
        extensions={[json()]}
        editable={false}
      />
    </div>
  );
}

export function ResultViewer({
  result,
}: {
  result?: Partial<InvokeResponse> | null;
}) {
  const errMsg = useMemo(
    () => (result ? extractErrorMessage(result) : null),
    [result],
  );

  if (!result) return <Empty description="调用后在此查看结果" />;

  const isToolError = result.isError || result.status === "tool_error";
  const isProtocolError =
    result.status === "protocol_error" || result.status === "timeout" || !!result.protocolError;
  const schemaFailed = result.schemaValidation && !result.schemaValidation.ok;
  const defaultTab =
    result.structuredContent !== undefined ? "structured" : "content";

  return (
    <div>
      <TimingBar
        startedAt={result.startedAt}
        endedAt={result.endedAt}
        durationMs={result.durationMs}
        status={result.status}
        isError={result.isError}
      />
      <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <SchemaBadge validation={result.schemaValidation} />
        {isToolError ? <Tag color="error">工具执行错误 (isError)</Tag> : null}
        {isProtocolError ? <Tag color="error">协议/连接错误</Tag> : null}
      </div>

      {isProtocolError && errMsg ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message="协议/连接错误"
          description={
            <div>
              <Typography.Paragraph style={{ marginBottom: 8 }} copyable>
                {errMsg}
              </Typography.Paragraph>
              {result.protocolError ? (
                <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12 }}>
                  {JSON.stringify(result.protocolError, null, 2)}
                </pre>
              ) : null}
            </div>
          }
        />
      ) : null}

      {isToolError && errMsg ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="工具返回错误"
          description={
            <Typography.Paragraph style={{ marginBottom: 0 }} copyable>
              {errMsg}
            </Typography.Paragraph>
          }
        />
      ) : null}

      {schemaFailed ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="outputSchema 校验未通过"
          description={
            <div>
              <div style={{ marginBottom: 6 }}>
                返回的 structuredContent 与工具声明的 outputSchema 不一致（可能是服务端实现问题）。
              </div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {(result.schemaValidation?.errors ?? []).slice(0, 8).map((e, i) => (
                  <li key={i}>
                    <code>{e.path || "/"}</code> {e.message}
                  </li>
                ))}
              </ul>
            </div>
          }
        />
      ) : null}

      <Tabs
        defaultActiveKey={defaultTab}
        items={[
          {
            key: "structured",
            label: "结构化输出",
            children:
              result.structuredContent === undefined ? (
                <Empty description="无 structuredContent" />
              ) : (
                <JsonPane value={result.structuredContent} />
              ),
          },
          {
            key: "content",
            label: "非结构化 Content",
            children: <ContentBlocks content={result.content ?? []} />,
          },
          {
            key: "assert",
            label: "断言",
            children: <AssertPanel result={result.assertResult} />,
          },
          {
            key: "schema",
            label: "Schema 校验",
            children: result.schemaValidation ? (
              <JsonPane value={result.schemaValidation} height="280px" />
            ) : (
              <Empty description="无校验信息" />
            ),
          },
          {
            key: "raw",
            label: "原始摘要",
            children: (
              <JsonPane
                value={{
                  status: result.status,
                  isError: result.isError,
                  durationMs: result.durationMs,
                  protocolError: result.protocolError ?? null,
                  content: result.content ?? [],
                  structuredContent: result.structuredContent ?? null,
                  schemaValidation: result.schemaValidation ?? null,
                }}
                height="400px"
              />
            ),
          },
        ]}
      />
    </div>
  );
}
