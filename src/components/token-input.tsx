"use client";
import { useState } from "react";
import { X } from "lucide-react";

export function TokenInput({
  name,
  label,
  initial = [],
}: {
  name: string;
  label: string;
  initial?: string[];
}) {
  const [tokens, setTokens] = useState(initial);
  const [draft, setDraft] = useState("");
  function commit(text: string) {
    setTokens((previous) => {
      const next = [...previous];
      for (const value of text
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)) {
        if (!next.some((item) => item.toLowerCase() === value.toLowerCase()))
          next.push(value);
      }
      return next;
    });
    setDraft("");
  }
  return (
    <div className="token-field">
      <label htmlFor={name}>{label}</label>
      <div className="token-input">
        {tokens.map((token) => (
          <span className="input-token" key={token}>
            {token}
            <button
              type="button"
              aria-label={`Remove ${token} from ${label.toLowerCase()}`}
              onClick={() => setTokens(tokens.filter((item) => item !== token))}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          id={name}
          aria-describedby={`${name}-hint`}
          value={draft}
          placeholder={`Add ${label.toLowerCase()}`}
          onChange={(event) => {
            const value = event.target.value;
            if (value.includes(",")) {
              const lastComma = value.lastIndexOf(",");
              commit(value.slice(0, lastComma));
              setDraft(value.slice(lastComma + 1));
            } else setDraft(value);
          }}
          onBlur={() => commit(draft)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if ([",", "Enter", "Tab"].includes(event.key)) {
              if (event.key !== "Tab") event.preventDefault();
              commit(draft);
            }
          }}
        />
      </div>
      <input
        type="hidden"
        name={name}
        value={[...tokens, draft].filter(Boolean).join(",")}
      />
      <small id={`${name}-hint`}>Confirm with comma, Enter or Tab.</small>
    </div>
  );
}
