"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shows a Server-Sent Events log stream and keeps it scrolled to the bottom.
 * Give it `key={url}` so a new URL starts from an empty view.
 */
export function LogStream({
  url,
  onEnd,
  className = "h-96",
}: {
  url: string;
  onEnd?: (lastLine: string) => void;
  className?: string;
}) {
  const [lines, setLines] = useState<string[]>([]);
  const [state, setState] = useState<"connecting" | "live" | "ended" | "error">("connecting");
  const box = useRef<HTMLPreElement>(null);
  const endRef = useRef(onEnd);
  useEffect(() => {
    endRef.current = onEnd;
  });

  useEffect(() => {
    const source = new EventSource(url);
    source.onopen = () => setState("live");
    source.onmessage = (event) =>
      setLines((previous) => [...previous.slice(-3000), JSON.parse(event.data) as string]);
    source.addEventListener("end", (event) => {
      setState("ended");
      source.close();
      endRef.current?.(JSON.parse((event as MessageEvent).data) as string);
    });
    source.onerror = () => {
      setState((current) => (current === "ended" ? current : "error"));
    };
    return () => source.close();
  }, [url]);

  useEffect(() => {
    const el = box.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const label = { connecting: "đang kết nối…", live: "trực tiếp", ended: "đã xong", error: "mất kết nối, đang thử lại…" }[state];
  return (
    <div>
      <p className="mb-1 text-xs text-base-content/40">● {label}</p>
      <pre ref={box} className={`log-view overflow-auto rounded-lg border border-base-300 bg-base-300 p-3 ${className}`}>
        {lines.join("\n")}
      </pre>
    </div>
  );
}
