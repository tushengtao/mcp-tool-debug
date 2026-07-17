import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export interface PanelSpec {
  key: string;
  content: ReactNode;
  /** initial width in px for left/middle; right takes remaining */
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  /** if true, panel takes remaining flex space (usually the last one) */
  flex?: boolean;
}

interface Props {
  panels: PanelSpec[];
  storageKey?: string;
  className?: string;
  style?: React.CSSProperties;
}

function loadWidths(storageKey: string | undefined, panels: PanelSpec[]): number[] {
  const defaults = panels.map((p) => p.defaultWidth ?? (p.flex ? 0 : 280));
  if (!storageKey) return defaults;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as number[];
    if (!Array.isArray(parsed) || parsed.length !== panels.length) return defaults;
    return parsed.map((n, i) =>
      typeof n === "number" && n > 0 ? n : defaults[i],
    );
  } catch {
    return defaults;
  }
}

export function ResizablePanels({ panels, storageKey, className, style }: Props) {
  const [widths, setWidths] = useState(() => loadWidths(storageKey, panels));
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    index: number;
    startX: number;
    startWidths: number[];
  } | null>(null);

  useEffect(() => {
    setWidths(loadWidths(storageKey, panels));
    // only re-init when panel count / storage key changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, panels.length]);

  const persist = useCallback(
    (next: number[]) => {
      if (!storageKey) return;
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // ignore
      }
    },
    [storageKey],
  );

  const onPointerDown = (index: number, e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      index,
      startX: e.clientX,
      startWidths: [...widths],
    };
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = e.clientX - drag.startX;
      const i = drag.index;
      const panel = panels[i];
      const min = panel.minWidth ?? 180;
      const max = panel.maxWidth ?? 800;
      const next = [...drag.startWidths];
      // resize panel i; if next panel is flex, it absorbs change
      let w = drag.startWidths[i] + delta;
      w = Math.max(min, Math.min(max, w));
      next[i] = w;
      // if both sides fixed, adjust neighbor
      if (i + 1 < panels.length && !panels[i + 1].flex) {
        const neighbor = panels[i + 1];
        const nMin = neighbor.minWidth ?? 180;
        const nMax = neighbor.maxWidth ?? 800;
        const total = drag.startWidths[i] + drag.startWidths[i + 1];
        let nW = total - w;
        nW = Math.max(nMin, Math.min(nMax, nW));
        w = total - nW;
        next[i] = w;
        next[i + 1] = nW;
      }
      setWidths(next);
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setWidths((w) => {
        persist(w);
        return w;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [panels, persist]);

  return (
    <div
      ref={containerRef}
      className={`resizable-panels ${className ?? ""}`}
      style={style}
    >
      {panels.map((panel, i) => (
        <div key={panel.key} className="resizable-panels-item-wrap">
          <div
            className={`resizable-panel ${panel.flex ? "is-flex" : ""}`}
            style={
              panel.flex
                ? { flex: 1, minWidth: panel.minWidth ?? 240 }
                : {
                    width: widths[i],
                    minWidth: panel.minWidth ?? 180,
                    maxWidth: panel.maxWidth,
                    flex: "0 0 auto",
                  }
            }
          >
            {panel.content}
          </div>
          {i < panels.length - 1 ? (
            <div
              className="resize-handle"
              onPointerDown={(e) => onPointerDown(i, e)}
              title="拖拽调整宽度"
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
