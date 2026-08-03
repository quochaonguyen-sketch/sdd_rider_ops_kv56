"use client";

import { useMemo, useSyncExternalStore } from "react";

export const AI_CONFIG_STORAGE_KEY = "rider-ops-ai-config";
export const AI_CONFIG_CHANGED_EVENT = "rider-ops-ai-config-changed";

export type BrowserAiConfig = {
  baseUrl: string;
  model: string;
};

export const DEFAULT_BROWSER_AI_CONFIG: BrowserAiConfig = {
  baseUrl: "",
  model: "gpt-4.1-mini",
};

export function readBrowserAiConfig(): BrowserAiConfig {
  if (typeof window === "undefined") return DEFAULT_BROWSER_AI_CONFIG;

  try {
    const saved = JSON.parse(window.localStorage.getItem(AI_CONFIG_STORAGE_KEY) ?? "null") as Partial<BrowserAiConfig> | null;
    return {
      baseUrl: typeof saved?.baseUrl === "string" ? saved.baseUrl.trim().replace(/\/$/, "") : "",
      model: typeof saved?.model === "string" && saved.model.trim() ? saved.model.trim() : DEFAULT_BROWSER_AI_CONFIG.model,
    };
  } catch {
    return DEFAULT_BROWSER_AI_CONFIG;
  }
}

export function saveBrowserAiConfig(config: BrowserAiConfig) {
  const normalized = {
    baseUrl: config.baseUrl.trim().replace(/\/$/, ""),
    model: config.model.trim() || DEFAULT_BROWSER_AI_CONFIG.model,
  };
  window.localStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(AI_CONFIG_CHANGED_EVENT, { detail: normalized }));
  return normalized;
}

export function useBrowserAiConfig() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => "");
  return useMemo(() => parseSnapshot(snapshot), [snapshot]);
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener(AI_CONFIG_CHANGED_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(AI_CONFIG_CHANGED_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function getSnapshot() {
  return window.localStorage.getItem(AI_CONFIG_STORAGE_KEY) ?? "";
}

function parseSnapshot(snapshot: string) {
  if (!snapshot) return DEFAULT_BROWSER_AI_CONFIG;
  try {
    const saved = JSON.parse(snapshot) as Partial<BrowserAiConfig>;
    return {
      baseUrl: typeof saved.baseUrl === "string" ? saved.baseUrl.trim().replace(/\/$/, "") : "",
      model: typeof saved.model === "string" && saved.model.trim() ? saved.model.trim() : DEFAULT_BROWSER_AI_CONFIG.model,
    };
  } catch {
    return DEFAULT_BROWSER_AI_CONFIG;
  }
}
