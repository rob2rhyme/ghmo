"use client";

import { Field } from "@/src/components/ui/field";
import { Select } from "@/src/components/ui/select";
import type { AudienceOptions, BroadcastAudience } from "@/src/lib/broadcast.shared";

/**
 * "Send to": everyone who agreed to email, or one group that is turned on (plan §30, D91), each with how
 * many people could be emailed now. A saved group that has since been turned off or deleted stays listed
 * (marked) so the admin sees why it can't be submitted, and can pick another.
 */
export function AudienceSelect({
  id,
  value,
  onChange,
  options,
  current,
  disabled
}: {
  id: string;
  value: BroadcastAudience;
  onChange: (audience: BroadcastAudience) => void;
  options: AudienceOptions | null;
  /** The saved group, when it isn't one of the options any more. */
  current?: { id: string; name: string | null } | null;
  disabled?: boolean;
}) {
  const members = (n: number) => `${n} ${n === 1 ? "member" : "members"}`;
  const selected = value.kind === "group" ? `group:${value.groupId}` : "all";
  const stale = current && !options?.groups.some(group => group.id === current.id) ? current : null;
  return (
    <Field
      label="Send to"
      description="Only people who can be emailed are counted: active, agreed to email, not unsubscribed. The list is taken again when sending starts."
    >
      <Select
        id={id}
        value={selected}
        disabled={disabled}
        onChange={event => {
          const next = event.target.value;
          onChange(next.startsWith("group:") ? { kind: "group", groupId: next.slice("group:".length) } : { kind: "all" });
        }}
      >
        <option value="all">Everyone who agreed to email{options ? ` (${members(options.all)})` : ""}</option>
        {options?.groups.length ? (
          <optgroup label="One group">
            {options.groups.map(group => (
              <option key={group.id} value={`group:${group.id}`}>
                {group.name} ({members(group.count)})
              </option>
            ))}
          </optgroup>
        ) : null}
        {stale ? (
          <option value={`group:${stale.id}`} disabled>
            {stale.name ? `${stale.name} (turned off)` : "A group that no longer exists"}
          </option>
        ) : null}
      </Select>
    </Field>
  );
}
