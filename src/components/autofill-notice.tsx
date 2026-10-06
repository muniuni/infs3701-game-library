"use client";
import { useEffect, useRef, useState } from "react";
export function AutofillNotice({
  count,
  onUndo,
  onExpire,
}: {
  count: number;
  onUndo: () => void;
  onExpire: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(10000);
  useEffect(() => {
    if (hovered || focused) return;
    const started = Date.now();
    const timer = window.setTimeout(onExpire, remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(
        0,
        remaining.current - (Date.now() - started),
      );
    };
  }, [hovered, focused, onExpire]);
  return (
    <div
      className="autofill-notice"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      <span role="status">
        Autofilled {count} {count === 1 ? "field" : "fields"}
      </span>
      <span aria-hidden="true">·</span>
      <button type="button" onClick={onUndo}>
        Undo
      </button>
    </div>
  );
}
