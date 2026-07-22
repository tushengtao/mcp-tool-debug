import {
  ConfigProvider,
  theme as antdTheme,
} from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { TransportType } from "@mcp-debug/shared";

export type AppLocale = "zh-CN" | "en-US";
export type ThemeMode = "light" | "dark" | "system";
export type DensityMode = "compact" | "comfortable";

interface UiContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  resolvedTheme: "light" | "dark";
  density: DensityMode;
  setDensity: (density: DensityMode) => void;
  defaultTimeoutMs: number;
  setDefaultTimeoutMs: (value: number) => void;
  transportPreference: TransportType;
  setTransportPreference: (value: TransportType) => void;
  text: (zh: string, en: string) => string;
}

const UiContext = createContext<UiContextValue | null>(null);

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function readNumber(key: string, fallback: number): number {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value >= 1000 ? value : fallback;
  } catch {
    return fallback;
  }
}

function useSystemTheme() {
  const [dark, setDark] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => setDark(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return dark ? "dark" : "light";
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<AppLocale>(() =>
    readStored("mcp-debug:locale", ["zh-CN", "en-US"] as const, "zh-CN"),
  );
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    readStored("mcp-debug:theme", ["light", "dark", "system"] as const, "system"),
  );
  const [density, setDensity] = useState<DensityMode>(() =>
    readStored("mcp-debug:density", ["compact", "comfortable"] as const, "compact"),
  );
  const [defaultTimeoutMs, setDefaultTimeoutMs] = useState(() =>
    readNumber("mcp-debug:default-timeout", 60000),
  );
  const [transportPreference, setTransportPreference] = useState<TransportType>(() =>
    readStored(
      "mcp-debug:transport",
      ["auto", "streamable_http", "sse"] as const,
      "auto",
    ),
  );
  const systemTheme = useSystemTheme();
  const resolvedTheme = themeMode === "system" ? systemTheme : themeMode;

  useEffect(() => {
    localStorage.setItem("mcp-debug:locale", locale);
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    localStorage.setItem("mcp-debug:theme", themeMode);
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme, themeMode]);

  useEffect(() => {
    localStorage.setItem("mcp-debug:density", density);
    document.documentElement.dataset.density = density;
  }, [density]);

  useEffect(() => {
    localStorage.setItem("mcp-debug:default-timeout", String(defaultTimeoutMs));
  }, [defaultTimeoutMs]);

  useEffect(() => {
    localStorage.setItem("mcp-debug:transport", transportPreference);
  }, [transportPreference]);

  const value = useMemo<UiContextValue>(
    () => ({
      locale,
      setLocale,
      themeMode,
      setThemeMode,
      resolvedTheme,
      density,
      setDensity,
      defaultTimeoutMs,
      setDefaultTimeoutMs,
      transportPreference,
      setTransportPreference,
      text: (zh, en) => (locale === "zh-CN" ? zh : en),
    }),
    [
      locale,
      themeMode,
      resolvedTheme,
      density,
      defaultTimeoutMs,
      transportPreference,
    ],
  );

  const dark = resolvedTheme === "dark";
  return (
    <UiContext.Provider value={value}>
      <ConfigProvider
        locale={locale === "zh-CN" ? zhCN : enUS}
        componentSize={density === "compact" ? "middle" : "large"}
        theme={{
          algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          token: {
            colorPrimary: dark ? "#3b82f6" : "#2563eb",
            colorSuccess: dark ? "#34d399" : "#059669",
            colorWarning: dark ? "#fbbf24" : "#d97706",
            colorError: dark ? "#f87171" : "#dc2626",
            colorInfo: dark ? "#38bdf8" : "#0284c7",
            colorBgLayout: dark ? "#0b0f17" : "#f7f9fc",
            colorBgContainer: dark ? "#111827" : "#ffffff",
            colorBgElevated: dark ? "#182235" : "#ffffff",
            colorText: dark ? "#f8fafc" : "#0f172a",
            colorTextSecondary: dark ? "#cbd5e1" : "#475569",
            colorBorder: dark ? "#273244" : "#dce3ed",
            colorBorderSecondary: dark ? "#1e293b" : "#e9eef5",
            borderRadius: 6,
            borderRadiusLG: 8,
            controlHeight: density === "compact" ? 32 : 36,
            fontSize: 14,
            fontFamily:
              'Inter, "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
          },
          components: {
            Button: { primaryShadow: "none", defaultShadow: "none" },
            Card: { boxShadowTertiary: "none" },
            Table: { headerBg: dark ? "#151c2b" : "#f8fafc" },
            Tabs: { horizontalMargin: "0 0 12px 0" },
          },
        }}
      >
        {children}
      </ConfigProvider>
    </UiContext.Provider>
  );
}

export function useUi(): UiContextValue {
  const value = useContext(UiContext);
  if (!value) throw new Error("useUi must be used inside UiProvider");
  return value;
}

