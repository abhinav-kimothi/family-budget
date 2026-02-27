"use client";

import { useEffect, useRef, useState } from "react";

function isManagedField(el: Element): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false;
  if (!el.name) return false;
  if (el.type === "hidden" || el.type === "file") return false;
  return el.name.startsWith("amount-") || el.name.startsWith("budget-");
}

export function EntriesDraftAutosave({
  formId,
  year,
  month,
}: {
  formId: string;
  year: number;
  month: number;
}) {
  const [status, setStatus] = useState<string>("Autosave on");
  const lastSavedSignatureRef = useRef<string>("");
  const inFlightRef = useRef(false);
  const submitRef = useRef(false);

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;

    const collectValues = () => {
      const values: Record<string, string> = {};
      for (const el of Array.from(form.elements)) {
        if (!isManagedField(el)) continue;
        values[el.name] = el.value;
      }
      return values;
    };

    // Treat server-rendered form values as the current synced baseline.
    lastSavedSignatureRef.current = JSON.stringify({ year, month, values: collectValues() });

    const autosaveToServer = async (reason: "debounce" | "blur" | "pagehide") => {
      if (submitRef.current) return;
      if (inFlightRef.current) return;
      const values = collectValues();
      const signature = JSON.stringify({ year, month, values });
      if (signature === lastSavedSignatureRef.current) return;
      inFlightRef.current = true;
      setStatus("Autosaving to server...");
      try {
        await fetch("/api/entries/autosave", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: signature,
          keepalive: reason === "pagehide",
        });
        lastSavedSignatureRef.current = signature;
        setStatus(`Saved ${new Date().toLocaleTimeString()}`);
      } catch {
        setStatus("Autosave failed (changes still in form)");
      } finally {
        inFlightRef.current = false;
      }
    };

    let debounceTimer: number | null = null;
    const onInput = () => {
      setStatus("Unsaved changes");
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        void autosaveToServer("debounce");
      }, 900);
    };
    const onBlur = () => {
      void autosaveToServer("blur");
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        void autosaveToServer("pagehide");
      }
    };
    const onPageHide = () => {
      void autosaveToServer("pagehide");
    };
    const onSubmit = () => {
      submitRef.current = true;
      setStatus("Saving to server...");
    };

    form.addEventListener("input", onInput);
    form.addEventListener("change", onBlur);
    form.addEventListener("submit", onSubmit);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      form.removeEventListener("input", onInput);
      form.removeEventListener("change", onBlur);
      form.removeEventListener("submit", onSubmit);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [formId, month, year]);

  return (
    <p className="text-[11px] text-slate-700 dark:text-slate-300">{status}</p>
  );
}
