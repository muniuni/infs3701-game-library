"use client";
import { useState, useImperativeHandle, type Ref } from "react";
import { DropdownMenu } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "./ui/button";
import { GameCover } from "./game-cover";
import { ScreenshotGallery } from "./game-metadata";
import {
  applyMetadata,
  metadataChoices,
  metadataFields,
  metadataLabels,
  metadataProposal,
  type IgdbGame,
  type MetadataDraft,
  type MetadataChoices,
  type MetadataField,
  type MetadataMode,
} from "@/lib/igdb";

function TextDiff({
  value,
  other,
  after,
}: {
  value: string;
  other: string;
  after: boolean;
}) {
  let start = 0,
    end = 0;
  while (
    start < Math.min(value.length, other.length) &&
    value[start] === other[start]
  )
    start++;
  while (
    end < Math.min(value.length, other.length) - start &&
    value[value.length - end - 1] === other[other.length - end - 1]
  )
    end++;
  const changed = value.slice(start, value.length - end);
  return (
    <>
      {value.slice(0, start)}
      {changed && (after ? <ins>{changed}</ins> : <del>{changed}</del>)}
      {end > 0 && value.slice(-end)}
    </>
  );
}
function Value({
  field,
  draft,
  other,
  after,
}: {
  field: MetadataField;
  draft: MetadataDraft;
  other: MetadataDraft;
  after: boolean;
}) {
  const changed = JSON.stringify(draft[field]) !== JSON.stringify(other[field]);
  if (field === "cover")
    return (
      <div className={changed ? (after ? "image-added" : "image-removed") : ""}>
        <GameCover cover={draft.cover} title={after ? "After" : "Before"} />
      </div>
    );
  if (field === "screenshots")
    return (
      <div className={changed ? (after ? "image-added" : "image-removed") : ""}>
        <ScreenshotGallery images={draft.screenshots} />
      </div>
    );
  const value = draft[field];
  if (Array.isArray(value))
    return (
      <div className="diff-tokens">
        {value.length ? (
          value.map((item) => {
            const exists = (other[field] as string[]).some(
              (value) => value.toLowerCase() === item.toLowerCase(),
            );
            return (
              <span
                key={item}
                className={
                  !exists ? (after ? "diff-added" : "diff-removed") : undefined
                }
              >
                {!exists && (after ? "+ " : "− ")}
                {item}
              </span>
            );
          })
        ) : (
          <span className="muted">Not set</span>
        )}
      </div>
    );
  if (!value) return <span className="muted">Not set</span>;
  return (
    <p className="metadata-prose">
      <TextDiff value={value} other={other[field] as string} after={after} />
    </p>
  );
}
export type ComparisonHandle = {
  pending: () =>
    | { draft: MetadataDraft; game: IgdbGame; replaceCover?: boolean }
    | undefined;
};
export function MetadataComparison({
  ref,
  draft,
  game,
  igdbId,
  onApply,
  onCancel,
}: {
  ref?: Ref<ComparisonHandle>;
  draft: MetadataDraft;
  game: IgdbGame;
  igdbId?: number;
  onApply: (
    next: MetadataDraft,
    game: IgdbGame,
    choices: MetadataChoices,
  ) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<MetadataMode>("empty");
  const [manual, setManual] = useState<MetadataChoices>();
  const available = metadataChoices(draft, game, "replace");
  const choices =
    mode === "manual" ? manual! : metadataChoices(draft, game, mode);
  const proposal = metadataProposal(draft, game);
  const next = applyMetadata(draft, game, choices);
  const overflow = next.tags.length > 30;
  const canApply =
    metadataFields.some((field) => choices[field] && available[field]) ||
    igdbId !== game.id ||
    (game.availablePlatforms !== undefined &&
      JSON.stringify(draft.availablePlatforms ?? []) !==
        JSON.stringify(game.availablePlatforms));
  useImperativeHandle(ref, () => ({
    pending: () =>
      overflow ? undefined : { draft: next, game, replaceCover: choices.cover },
  }));
  function changeMode(value: string) {
    if (value === "manual" && !manual) setManual({ ...choices });
    setMode(value as MetadataMode);
  }
  return (
    <>
      <div className="comparison-scroll">
        <table className="metadata-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Before</th>
              <th>After</th>
            </tr>
          </thead>
          <tbody>
            {metadataFields.map((field) => (
              <tr
                key={field}
                className={
                  !choices[field] || !available[field] ? "is-excluded" : ""
                }
              >
                <th scope="row">
                  {mode === "manual" ? (
                    <label className="diff-choice">
                      <input
                        type="checkbox"
                        aria-label={`Update ${metadataLabels[field]}`}
                        checked={!!choices[field] && available[field]}
                        disabled={!available[field]}
                        onChange={(event) =>
                          setManual({
                            ...choices,
                            [field]: event.target.checked,
                          })
                        }
                      />
                      {metadataLabels[field]}
                    </label>
                  ) : (
                    metadataLabels[field]
                  )}
                </th>
                <td data-label="Before">
                  <Value
                    field={field}
                    draft={draft}
                    other={proposal}
                    after={false}
                  />
                </td>
                <td data-label="After">
                  <Value field={field} draft={proposal} other={draft} after />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {overflow && (
        <p role="alert" className="error-message">
          Tags exceed the 30-item limit. Deselect Tags or remove tags in the
          form.
        </p>
      )}
      <div className="dialog-actions form-actions metadata-actions">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <div className="split-button">
          <Button
            type="button"
            disabled={!canApply || overflow}
            onClick={() => onApply(next, game, choices)}
          >
            {mode === "empty"
              ? "Update if empty"
              : mode === "replace"
                ? "Replace current data"
                : "Apply selected"}
          </Button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button type="button" aria-label="Choose update mode">
                <ChevronDown size={16} />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="metadata-menu"
                align="end"
                sideOffset={6}
              >
                <DropdownMenu.RadioGroup
                  value={mode}
                  onValueChange={changeMode}
                >
                  {[
                    ["empty", "Update if empty"],
                    ["replace", "Replace current data"],
                    ["manual", "Select manually"],
                  ].map(([value, label]) => (
                    <DropdownMenu.RadioItem
                      className="metadata-menu-item"
                      key={value}
                      value={value}
                    >
                      {label}
                      <DropdownMenu.ItemIndicator>
                        <Check size={15} />
                      </DropdownMenu.ItemIndicator>
                    </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.RadioGroup>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
    </>
  );
}
