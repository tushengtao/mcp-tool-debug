import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export interface PanelSpec {
  key: string;
  content: ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  flex?: boolean;
}

interface Props {
  panels: PanelSpec[];
  storageKey?: string;
  className?: string;
  style?: React.CSSProperties;
}

function loadWidths(storageKey: string | undefined, panels: PanelSpec[]): number[] {
  const defaults = panels.map((panel) => panel.defaultWidth ?? (panel.flex ? 0 : 280));
  if (!storageKey) return defaults;
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "null") as number[] | null;
    return Array.isArray(parsed) && parsed.length === panels.length ? parsed.map((value, index) => typeof value === "number" && value > 0 ? value : defaults[index]) : defaults;
  } catch { return defaults; }
}

function loadCollapsed(storageKey?: string): string[] {
  if (!storageKey) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(`${storageKey}:collapsed`) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch { return []; }
}

export function ResizablePanels({ panels, storageKey, className, style }: Props) {
  const [widths, setWidths] = useState(() => loadWidths(storageKey, panels));
  const [collapsed, setCollapsed] = useState<string[]>(() => loadCollapsed(storageKey));
  const dragRef = useRef<{ index: number; startX: number; startWidths: number[] } | null>(null);

  useEffect(() => { setWidths(loadWidths(storageKey, panels)); setCollapsed(loadCollapsed(storageKey)); }, [storageKey, panels.length]);
  const persist = useCallback((next: number[]) => { if (storageKey) localStorage.setItem(storageKey, JSON.stringify(next)); }, [storageKey]);
  const toggleCollapsed = (key: string) => setCollapsed((current) => {
    const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
    if (storageKey) localStorage.setItem(`${storageKey}:collapsed`, JSON.stringify(next));
    return next;
  });
  const resizeBy = (index: number, delta: number) => setWidths((current) => {
    const next = [...current];
    next[index] = Math.max(panels[index].minWidth ?? 180, Math.min(panels[index].maxWidth ?? 1000, current[index] + delta));
    persist(next);
    return next;
  });

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const next = [...drag.startWidths];
      const panel = panels[drag.index];
      const target = Math.max(panel.minWidth ?? 180, Math.min(panel.maxWidth ?? 1000, drag.startWidths[drag.index] + event.clientX - drag.startX));
      next[drag.index] = target;
      if (drag.index + 1 < panels.length && !panels[drag.index + 1].flex) {
        const neighbor = panels[drag.index + 1];
        const total = drag.startWidths[drag.index] + drag.startWidths[drag.index + 1];
        next[drag.index + 1] = Math.max(neighbor.minWidth ?? 180, Math.min(neighbor.maxWidth ?? 1000, total - target));
        next[drag.index] = total - next[drag.index + 1];
      }
      setWidths(next);
    };
    const onUp = () => { if (dragRef.current) { dragRef.current = null; setWidths((current) => { persist(current); return current; }); } };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [panels, persist]);

  return <div className={`resizable-panels ${className ?? ""}`} style={style}>
    {panels.map((panel, index) => {
      const isCollapsed = collapsed.includes(panel.key);
      return <div key={panel.key} className={`resizable-panels-item-wrap ${isCollapsed ? "is-collapsed" : ""}`}>
        <div className={`resizable-panel ${panel.flex ? "is-flex" : ""}`} aria-hidden={isCollapsed} style={isCollapsed ? { width: 0, minWidth: 0, flex: "0 0 0" } : panel.flex ? { flex: 1, minWidth: panel.minWidth ?? 240 } : { width: widths[index], minWidth: panel.minWidth ?? 180, maxWidth: panel.maxWidth, flex: "0 0 auto" }}>{panel.content}</div>
        {index < panels.length - 1 && <div
          className="resize-handle"
          onPointerDown={(event) => { event.preventDefault(); (event.target as HTMLElement).setPointerCapture?.(event.pointerId); dragRef.current = { index, startX: event.clientX, startWidths: [...widths] }; }}
          onDoubleClick={() => toggleCollapsed(panel.key)}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); toggleCollapsed(panel.key); }
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); if (isCollapsed) toggleCollapsed(panel.key); else resizeBy(index, event.key === "ArrowLeft" ? -16 : 16); }
          }}
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${panel.key} panel`}
          aria-valuemin={panel.minWidth ?? 180}
          aria-valuemax={panel.maxWidth ?? 1000}
          aria-valuenow={isCollapsed ? 0 : widths[index]}
          tabIndex={0}
          title="拖动调整宽度；双击或按 Enter 折叠"
        />}
      </div>;
    })}
  </div>;
}
