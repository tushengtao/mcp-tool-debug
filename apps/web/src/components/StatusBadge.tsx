import {
  CheckCircleFilled,
  CloseCircleFilled,
  ExclamationCircleFilled,
  LoadingOutlined,
  MinusCircleFilled,
} from "@ant-design/icons";
import type { ReactNode } from "react";

export type StatusTone = "success" | "warning" | "error" | "processing" | "neutral";
type StatusValue = StatusTone | "online" | "offline" | "running";

const icons: Record<StatusTone, ReactNode> = {
  success: <CheckCircleFilled />,
  warning: <ExclamationCircleFilled />,
  error: <CloseCircleFilled />,
  processing: <LoadingOutlined spin />,
  neutral: <MinusCircleFilled />,
};

export function StatusBadge({ tone, status, label, children }: { tone?: StatusTone; status?: StatusValue; label?: ReactNode; children?: ReactNode }) {
  const resolvedTone: StatusTone = tone ?? (status === "online" ? "success" : status === "offline" ? "neutral" : status === "running" ? "processing" : status ?? "neutral");
  return (
    <span className={`status-badge status-badge--${resolvedTone}`}>
      {icons[resolvedTone]}
      <span>{label ?? children}</span>
    </span>
  );
}
