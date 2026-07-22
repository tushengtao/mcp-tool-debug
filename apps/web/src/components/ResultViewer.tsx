import { useMemo } from "react";
import { Alert, Empty, Tabs, Tag, Typography } from "antd";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AssertResult, ContentItem, InvokeResponse, SchemaValidationResult } from "@mcp-debug/shared";
import { TimingBar } from "./TimingBar";
import { StatusBadge } from "./StatusBadge";
import { JsonCodeEditor } from "./JsonCodeEditor";
import { useUi } from "../ui";

const contentText = (content: ContentItem[] = []) => content.filter((item) => item.type === "text" && typeof item.text === "string").map((item) => item.text).join("\n");
function extractError(result: Partial<InvokeResponse>): string | null {
  if (result.protocolError) return typeof (result.protocolError as any).message === "string" ? (result.protocolError as any).message : JSON.stringify(result.protocolError);
  const structured = result.structuredContent as any;
  if (structured && typeof structured === "object") return structured.error ?? structured.message ?? structured.raw_response?.msg ?? structured.msg ?? null;
  const text = contentText(result.content);
  return text && (result.isError || result.status === "tool_error") ? text : null;
}

function MarkdownView({ value }: { value: string }) {
  return <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children, ...props }) => <a href={href} target="_blank" rel="noreferrer" {...props}>{children}</a>, table: ({ children, ...props }) => <div className="md-table-wrap"><table {...props}>{children}</table></div> }}>{value}</ReactMarkdown></div>;
}

function ContentBlocks({ content }: { content: ContentItem[] }) {
  const { text } = useUi();
  if (!content.length) return <Empty description={text("无非结构化 Content", "No unstructured content")} />;
  return <div className="content-blocks">{content.map((item, index) => {
    if (item.type === "text") return <div className="content-block" key={index}><div className="meta"><Tag color="blue">Markdown</Tag>{item.mimeType && <span>{item.mimeType}</span>}</div><MarkdownView value={item.text ?? ""} /></div>;
    if (item.type === "image" && item.data) return <div className="content-block" key={index}><div className="meta"><Tag>image</Tag><span>{item.mimeType}</span></div><img alt="Tool output" src={`data:${item.mimeType || "image/png"};base64,${item.data}`} /></div>;
    if (item.type === "audio" && item.data) return <div className="content-block" key={index}><div className="meta"><Tag>audio</Tag><span>{item.mimeType}</span></div><audio controls src={`data:${item.mimeType || "audio/wav"};base64,${item.data}`} /></div>;
    if (item.type === "resource_link") return <div className="content-block" key={index}><Tag>resource_link</Tag><Typography.Link href={item.uri} target="_blank">{item.name ?? item.uri}</Typography.Link>{item.description && <MarkdownView value={item.description} />}</div>;
    const value = item.type === "resource" && item.resource ? item.resource : item;
    return <div className="content-block" key={index}><div className="meta"><Tag>{item.type || "unknown"}</Tag></div><pre className="breakable-pre">{JSON.stringify(value, null, 2)}</pre></div>;
  })}</div>;
}

function SchemaBadge({ validation }: { validation?: SchemaValidationResult | null }) {
  const { text } = useUi();
  if (!validation) return <StatusBadge status="offline" label={text("无 outputSchema 校验", "No outputSchema validation")} />;
  return <StatusBadge status={validation.ok ? "success" : "error"} label={validation.ok ? text("Schema 通过", "Schema valid") : text("Schema 失败", "Schema invalid")} />;
}

function Assertion({ value }: { value?: AssertResult | null }) {
  const { text } = useUi();
  if (!value) return <Empty description={text("无断言结果", "No assertion result")} />;
  return <div className="assert-list"><StatusBadge status={value.passed ? "success" : "error"} label={value.passed ? text("断言通过", "Assertions passed") : text("断言失败", "Assertions failed")} />{value.checks.map((check, index) => <div key={index}><StatusBadge status={check.passed ? "success" : "error"} label={check.name} /><span>{check.message || (check.passed ? "ok" : "failed")}</span></div>)}</div>;
}

function JsonPane({ value, height = "360px" }: { value: unknown; height?: string }) {
  return <JsonCodeEditor value={JSON.stringify(value, null, 2)} height={height} editable={false} />;
}

export function ResultViewer({
  result,
  requestArguments,
  rawResponse,
}: {
  result?: Partial<InvokeResponse> | null;
  requestArguments?: unknown;
  rawResponse?: unknown;
}) {
  const { text } = useUi();
  const error = useMemo(() => result ? extractError(result) : null, [result]);
  if (!result) return <div className="result-empty"><Empty description={text("调用后在此查看结果", "Call a tool to inspect its result")} /></div>;
  const toolError = result.isError || result.status === "tool_error";
  const protocolError = result.status === "protocol_error" || result.status === "timeout" || Boolean(result.protocolError);
  const schemaFailed = result.schemaValidation && !result.schemaValidation.ok;
  return <div className="result-viewer">
    <TimingBar startedAt={result.startedAt} endedAt={result.endedAt} durationMs={result.durationMs} status={result.status} isError={result.isError} />
    <div className="result-badges"><SchemaBadge validation={result.schemaValidation} />{toolError && <StatusBadge status="error" label={text("Tool 返回 isError", "Tool returned isError")} />}{protocolError && <StatusBadge status="error" label={text("协议/连接错误", "Protocol/connection error")} />}</div>
    {protocolError && error && <Alert type="error" showIcon message={text("协议/连接错误", "Protocol/connection error")} description={<Typography.Paragraph copyable className="breakable-text">{error}</Typography.Paragraph>} />}
    {toolError && error && !protocolError && <Alert type="warning" showIcon message={text("Tool 执行错误", "Tool execution error")} description={<Typography.Paragraph copyable className="breakable-text">{error}</Typography.Paragraph>} />}
    {schemaFailed && <Alert type="info" showIcon message={text("outputSchema 校验未通过", "outputSchema validation failed")} description={<ul>{result.schemaValidation?.errors.slice(0, 8).map((item, index) => <li key={index}><code>{item.path || "/"}</code> {item.message}</li>)}</ul>} />}
    <Tabs defaultActiveKey={result.structuredContent !== undefined ? "structured" : "content"} items={[
      { key: "structured", label: text("结构化输出", "Structured"), children: result.structuredContent === undefined ? <Empty description={text("无 structuredContent", "No structuredContent")} /> : <JsonPane value={result.structuredContent} /> },
      { key: "content", label: "Content", children: <ContentBlocks content={result.content ?? []} /> },
      { key: "assert", label: text("断言", "Assertions"), children: <Assertion value={result.assertResult} /> },
      { key: "schema", label: "Schema", children: result.schemaValidation ? <JsonPane value={result.schemaValidation} height="280px" /> : <Empty description={text("无校验信息", "No validation information")} /> },
      { key: "request", label: text("请求参数", "Request"), children: requestArguments === undefined ? <Empty description={text("无请求参数", "No request arguments")} /> : <JsonPane value={requestArguments} height="320px" /> },
      { key: "response", label: text("原始响应", "Raw response"), children: rawResponse === undefined ? <Empty description={text("无原始响应", "No raw response")} /> : <JsonPane value={rawResponse} height="360px" /> },
      { key: "raw", label: text("原始摘要", "Raw summary"), children: <JsonPane value={{ status: result.status, isError: result.isError, durationMs: result.durationMs, protocolError: result.protocolError ?? null, content: result.content ?? [], structuredContent: result.structuredContent ?? null, schemaValidation: result.schemaValidation ?? null }} height="400px" /> },
    ]} />
  </div>;
}
