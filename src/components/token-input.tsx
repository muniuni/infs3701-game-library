"use client";
import { useEffect, useRef, useState } from "react";
import { Popover } from "radix-ui";
import { Plus, X } from "lucide-react";

export function TokenInput({
  name,
  label,
  initial = [],
  suggestions = [],
  chips = false,
  disabled = false,
  value,
  onValueChange,
}: {
  name: string;
  label: string;
  initial?: string[];
  suggestions?: string[];
  chips?: boolean;
  disabled?: boolean;
  value?: string[];
  onValueChange?: (value: string[]) => void;
}) {
  const [internalTokens, setInternalTokens] = useState(initial);
  const tokens = value ?? internalTokens;
  function setTokens(update: (previous: string[]) => string[]) {
    const next = update(tokens);
    if (onValueChange) onValueChange(next);
    else setInternalTokens(next);
  }
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const matches = suggestions.filter(
    (value, index, values) =>
      values.findIndex((item) => item.toLowerCase() === value.toLowerCase()) ===
        index &&
      !tokens.some((token) => token.toLowerCase() === value.toLowerCase()) &&
      value.toLowerCase().includes(draft.trim().toLowerCase()),
  );
  const showList = !disabled && open && !!draft.trim() && matches.length > 0;
  useEffect(() => {
    list.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  function commit(text: string) {
    if (disabled) return;
    setTokens((previous) => {
      const next = [...previous];
      for (const value of text
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)) {
        const canonical =
          suggestions.find(
            (item) => item.toLowerCase() === value.toLowerCase(),
          ) ?? value;
        if (
          !next.some((item) => item.toLowerCase() === canonical.toLowerCase())
        )
          next.push(canonical);
      }
      return next;
    });
    setDraft("");
    setActive(-1);
    setOpen(false);
  }
  return (
    <div className={`token-field${chips ? " platform-field" : ""}`}>
      <label htmlFor={name}>{label}</label>
      <Popover.Root open={showList} onOpenChange={setOpen}>
        <Popover.Anchor asChild>
          <div className="token-input">
            {tokens.map((token) => (
              <span className="input-token" key={token}>
                {token}
                <button
                  type="button"
                  aria-label={`Remove ${token} from ${label.toLowerCase()}`}
                  onClick={() => {
                    setTokens((previous) =>
                      previous.filter((item) => item !== token),
                    );
                    input.current?.focus();
                  }}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </span>
            ))}
            <input
              id={name}
              disabled={disabled}
              ref={input}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showList}
              aria-controls={showList ? `${name}-suggestions` : undefined}
              aria-activedescendant={
                showList && active >= 0 && active < matches.length
                  ? `${name}-option-${active}`
                  : undefined
              }
              autoComplete="off"
              value={draft}
              placeholder={`Add ${label.toLowerCase()}`}
              onFocus={() => setOpen(true)}
              onChange={(event) => {
                const value = event.target.value;
                if (value.includes(",")) {
                  const lastComma = value.lastIndexOf(",");
                  commit(value.slice(0, lastComma));
                  setDraft(value.slice(lastComma + 1));
                } else setDraft(value);
                setOpen(true);
                setActive(-1);
              }}
              onBlur={() => commit(draft)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (
                  (event.key === "ArrowDown" || event.key === "ArrowUp") &&
                  draft.trim() &&
                  matches.length
                ) {
                  event.preventDefault();
                  setOpen(true);
                  setActive((previous) =>
                    event.key === "ArrowDown"
                      ? (previous + 1) % matches.length
                      : previous <= 0
                        ? matches.length - 1
                        : previous - 1,
                  );
                } else if (event.key === "Escape" && showList) {
                  event.preventDefault();
                  event.stopPropagation();
                  setOpen(false);
                  setActive(-1);
                } else if ([",", "Enter", "Tab"].includes(event.key)) {
                  if (event.key !== "Tab") event.preventDefault();
                  commit(
                    event.key === "Enter" && showList && active >= 0
                      ? (matches[active] ?? draft)
                      : draft,
                  );
                } else if (event.key === "Backspace" && !draft)
                  setTokens((previous) => previous.slice(0, -1));
              }}
            />
          </div>
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={12}
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
            onInteractOutside={(event) => {
              if (
                event.target instanceof Node &&
                input.current?.contains(event.target)
              )
                event.preventDefault();
            }}
            ref={list}
            id={`${name}-suggestions`}
            role="listbox"
            aria-label={`Suggested ${label.toLowerCase()}`}
            className="token-suggestions"
          >
            {matches.map((value, index) => (
              <div
                key={value}
                id={`${name}-option-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => {
                  commit(value);
                  input.current?.focus();
                }}
              >
                {value}
              </div>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {chips && !draft && matches.length > 0 && (
        <div
          className="platform-suggestions"
          role="group"
          aria-label="Suggested platforms"
        >
          {matches.slice(0, 8).map((value) => (
            <button
              key={value}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                commit(value);
                input.current?.focus();
              }}
            >
              <Plus size={12} aria-hidden="true" />
              {value}
            </button>
          ))}
        </div>
      )}
      <input
        type="hidden"
        name={name}
        value={[...tokens, draft].filter(Boolean).join(",")}
      />
    </div>
  );
}
