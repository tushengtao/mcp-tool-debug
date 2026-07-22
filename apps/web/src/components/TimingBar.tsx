import dayjs from "dayjs";
import type { RunStatus } from "@mcp-debug/shared";
import { StatusBadge } from "./StatusBadge";
import { useUi } from "../ui";

export function TimingBar({ startedAt, endedAt, durationMs, status, isError }: { startedAt?: string; endedAt?: string; durationMs?: number; status?: RunStatus; isError?: boolean }) {
  const { text } = useUi();
  return <div className="timing-bar">
    <div className="item"><span className="label">{text("开始时间", "Started")}</span><span className="value">{startedAt ? dayjs(startedAt).format("HH:mm:ss.SSS") : "—"}</span></div>
    <div className="item"><span className="label">{text("结束时间", "Ended")}</span><span className="value">{endedAt ? dayjs(endedAt).format("HH:mm:ss.SSS") : "—"}</span></div>
    <div className="item"><span className="label">{text("耗时", "Duration")}</span><span className="value">{durationMs == null ? "—" : `${durationMs} ms`}</span></div>
    <div className="item"><span className="label">{text("状态", "Status")}</span><StatusBadge status={isError ? "error" : status === "success" ? "success" : status === "timeout" ? "warning" : "error"} label={status ?? "—"} /></div>
  </div>;
}
