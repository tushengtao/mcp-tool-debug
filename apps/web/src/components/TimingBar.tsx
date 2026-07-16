import { Tag } from "antd";
import type { RunStatus } from "@mcp-debug/shared";

const statusColor: Record<RunStatus, string> = {
  success: "success",
  tool_error: "warning",
  protocol_error: "error",
  timeout: "orange",
  cancelled: "default",
};

export function TimingBar(props: {
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  status?: RunStatus | string;
  isError?: boolean;
}) {
  if (!props.startedAt) return null;
  return (
    <div className="timing-bar">
      <div className="item">
        <span className="label">发起时间</span>
        <span className="value">{props.startedAt}</span>
      </div>
      <div className="item">
        <span className="label">结束时间</span>
        <span className="value">{props.endedAt ?? "-"}</span>
      </div>
      <div className="item">
        <span className="label">耗时</span>
        <span className="value">{props.durationMs != null ? `${props.durationMs} ms` : "-"}</span>
      </div>
      <div className="item">
        <span className="label">状态</span>
        <span className="value">
          <Tag color={statusColor[(props.status as RunStatus) ?? "success"] ?? "default"}>
            {props.status}
            {props.isError ? " / isError" : ""}
          </Tag>
        </span>
      </div>
    </div>
  );
}
