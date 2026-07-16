import { Alert, Empty, Tabs, Tag } from "antd";
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

export function ResultViewer({
  result,
}: {
  result?: Partial<InvokeResponse> | null;
}) {
  if (!result) return <Empty description="调用后在此查看结果" />;

  return (
    <div>
      <TimingBar
        startedAt={result.startedAt}
        endedAt={result.endedAt}
        durationMs={result.durationMs}
        status={result.status}
        isError={result.isError}
      />
      <div style={{ marginBottom: 12 }}>
        <SchemaBadge validation={result.schemaValidation} />
      </div>
      {result.protocolError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message="协议/连接错误"
          description={
            <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(result.protocolError, null, 2)}
            </pre>
          }
        />
      ) : null}
      <Tabs
        items={[
          {
            key: "structured",
            label: "结构化输出",
            children:
              result.structuredContent === undefined ? (
                <Empty description="无 structuredContent" />
              ) : (
                <div className="json-editor">
                  <CodeMirror
                    value={JSON.stringify(result.structuredContent, null, 2)}
                    height="360px"
                    extensions={[json()]}
                    editable={false}
                  />
                </div>
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
              <div className="json-editor">
                <CodeMirror
                  value={JSON.stringify(result.schemaValidation, null, 2)}
                  height="280px"
                  extensions={[json()]}
                  editable={false}
                />
              </div>
            ) : (
              <Empty description="无校验信息" />
            ),
          },
        ]}
      />
    </div>
  );
}
