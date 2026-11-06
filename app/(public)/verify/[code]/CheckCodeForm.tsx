"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";

/**
 * "Check another code": opens /verify/<code>. Accepts the code or the whole printed web address;
 * spaces and dashes are dropped and letters made capitals, as printed.
 */
export default function CheckCodeForm({ label = "Check another code" }: { label?: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const typed = code.match(/verify\/([^/?#\s]+)/i)?.[1] ?? code;
    const cleaned = typed.replace(/[\s-]+/g, "").toUpperCase();
    if (!cleaned) {
      setError("Enter the code from the certificate.");
      return;
    }
    setError(null);
    router.push(`/verify/${encodeURIComponent(cleaned)}`);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label={label} description="The code is at the end of the web address printed next to the QR code. You can paste the whole address." error={error}>
        <Input
          id="verify-code"
          name="code"
          value={code}
          onChange={e => setCode(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="ABCD EFGH IJKL MNOP"
        />
      </Field>
      <Button type="submit" size="lg" className="w-full sm:w-auto sm:self-start">
        <Search aria-hidden="true" />
        Check code
      </Button>
    </form>
  );
}
