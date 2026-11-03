"use client";

import { Printer, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { normalizeRecoveryKeyInput, pickVerificationGroups } from "@/src/lib/e2ee/recovery";
import type { PreparedRecovery } from "@/src/lib/e2ee/client/E2eeProvider";
import { formatShortDate } from "@/src/lib/format";

type Props = {
  prepared: PreparedRecovery;
  submitLabel: string;
  onSubmit: (trustees: string[]) => Promise<void>;
};

/**
 * Shows a new recovery key once, makes the person prove they copied it, and
 * records the two trustees who each keep a paper copy (plan decision D1).
 */
export function RecoveryKeyFlow({ prepared, submitLabel, onSubmit }: Props) {
  const groups = useMemo(() => prepared.printable.split("-"), [prepared.printable]);
  const [checkGroups] = useState(() => pickVerificationGroups());
  const [step, setStep] = useState<"show" | "verify" | "trustees">("show");
  const [answers, setAnswers] = useState<string[]>(["", ""]);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [trustees, setTrustees] = useState(["", ""]);
  const [confirmed, setConfirmed] = useState([false, false]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (step === "show") {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="warning">
          <ShieldAlert />
          <AlertTitle>Write this down now. It will not be shown again.</AlertTitle>
          <AlertDescription>
            This recovery key is the only way back in if every admin loses their devices. Print it or copy it by hand, twice:
            one copy for each trustee. Never store it in email, chat or a photo.
          </AlertDescription>
        </Alert>
        <div className="print-area rounded-xl border-2 border-dashed border-border bg-card p-4">
          <p className="mb-3 text-sm font-semibold">GHMO admin recovery key</p>
          <ol className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-lg tracking-widest sm:grid-cols-4" aria-label="Recovery key groups">
            {groups.map((g, i) => (
              <li key={i} className="flex items-baseline gap-2">
                <span className="w-5 text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                <span>{g}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm text-muted-foreground">Created {formatShortDate(new Date())}. Keep in a safe place.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="lg" onClick={() => setStep("verify")}>
            I have written it down
          </Button>
          <Button size="lg" variant="outline" onClick={() => window.print()}>
            <Printer aria-hidden="true" />
            Print
          </Button>
        </div>
      </div>
    );
  }

  if (step === "verify") {
    const check = () => {
      const ok = checkGroups.every((g, i) => normalizeRecoveryKeyInput(answers[i]) === normalizeRecoveryKeyInput(groups[g]));
      if (ok) {
        setVerifyError(null);
        setStep("trustees");
      } else {
        setVerifyError("That doesn't match. Check your copy, or go back and copy the key again.");
      }
    };
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          To make sure your copy is right, type these groups from your paper copy. Each group is 4 letters or numbers.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {checkGroups.map((g, i) => (
            <Field key={g} label={`Group ${g + 1}`}>
              <Input
                className="font-mono uppercase tracking-widest"
                maxLength={4}
                autoComplete="off"
                value={answers[i]}
                onChange={e => setAnswers(a => a.map((v, j) => (j === i ? e.target.value : v)))}
              />
            </Field>
          ))}
        </div>
        {verifyError ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {verifyError}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button size="lg" onClick={check}>
            Check
          </Button>
          <Button size="lg" variant="outline" onClick={() => setStep("show")}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  const ready =
    trustees.every(t => t.trim().length > 0) &&
    trustees[0].trim().toLowerCase() !== trustees[1].trim().toLowerCase() &&
    confirmed.every(Boolean);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(trustees.map(t => t.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Two different people each keep one paper copy, somewhere safe and separate (for example, two board members). Write their names
        here so everyone knows who to ask.
      </p>
      {[0, 1].map(i => (
        <div key={i} className="flex flex-col gap-3 rounded-xl border border-border p-4">
          <Field label={`Trustee ${i + 1}`}>
            <Input value={trustees[i]} maxLength={80} onChange={e => setTrustees(t => t.map((v, j) => (j === i ? e.target.value : v)))} />
          </Field>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm sm:min-h-0">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-primary"
              checked={confirmed[i]}
              onChange={e => setConfirmed(c => c.map((v, j) => (j === i ? e.target.checked : v)))}
            />
            {trustees[i].trim() || `Trustee ${i + 1}`} has their own paper copy
          </label>
        </div>
      ))}
      {trustees[0].trim() && trustees[0].trim().toLowerCase() === trustees[1].trim().toLowerCase() ? (
        <p className="text-sm font-medium text-destructive">The two trustees must be different people.</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="lg" onClick={submit} disabled={!ready} loading={busy}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
