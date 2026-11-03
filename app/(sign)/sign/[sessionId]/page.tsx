"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock, Eraser } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { fromBase64Url, sealSignature, type PublicJwk } from "@/src/lib/e2ee";
import { formatDateTime } from "@/src/lib/format";

type SigningStatus = "pending" | "signed" | "expired" | "finalized" | "cancelled";

const ROLE_LABELS: Record<string, string> = {
  witness1: "Witness 1",
  witness2: "Witness 2",
  officiant: "Officiant",
  issuingAuthority: "Issuing Authority"
};

type SealTarget = { epoch: number; publicJwk: PublicJwk };

function pngBytes(dataUrl: string) {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return fromBase64Url(base64);
}

export default function SigningPage() {
  // Next 16 hands page params over as a promise; the hook reads them synchronously in a client page.
  const params = useParams<{ sessionId: string }>();
  const [seal, setSeal] = useState<SealTarget | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<SigningStatus | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const roleLabel = useMemo(() => (role ? ROLE_LABELS[role] ?? role : "Signer"), [role]);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch(`/api/signing-sessions/${params.sessionId}`);
        if (!response.ok) {
          setMessage("Session not found.");
          return;
        }
        const payload = await response.json();
        setStatus(payload.status ?? "pending");
        setRole(payload.role ?? null);
        setExpiresAt(payload.expiresAt ?? null);
        setSeal(payload.seal ?? null);
      } catch (error) {
        console.error("Failed to load signing session", error);
        setMessage("Unable to load session.");
      }
    };
    fetchStatus();
  }, [params.sessionId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      context.scale(ratio, ratio);
      context.lineWidth = 2;
      context.lineCap = "round";
      context.strokeStyle = "#f8fafc";
      context.fillStyle = "#0b1220";
      context.fillRect(0, 0, width, height);
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    let drawing = false;

    const getPoint = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const handlePointerDown = (event: PointerEvent) => {
      drawing = true;
      const point = getPoint(event);
      context.beginPath();
      context.moveTo(point.x, point.y);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!drawing) return;
      const point = getPoint(event);
      context.lineTo(point.x, point.y);
      context.stroke();
    };

    const handlePointerUp = () => {
      drawing = false;
      context.closePath();
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointerleave", handlePointerUp);
    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointerleave", handlePointerUp);
    };
  }, []);

  const handleClear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#0b1220";
    context.fillRect(0, 0, canvas.width, canvas.height);
  };

  const handleSubmit = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      const dataUrl = canvas.toDataURL("image/png");
      // When the workspace is end-to-end encrypted, the signature is sealed here and the server only stores ciphertext.
      const signature = seal
        ? { signatureSealed: await sealSignature(pngBytes(dataUrl), seal.publicJwk, seal.epoch, params.sessionId) }
        : { dataUrl };
      const response = await fetch(`/api/signing-sessions/${params.sessionId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...signature, signerName: signerName.trim() || undefined })
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error ?? `Failed to submit (${response.status})`);
      }
      setStatus("signed");
      setMessage("Signature submitted. You can close this page.");
    } catch (error) {
      console.error("Signature submit failed", error);
      setMessage(error instanceof Error ? error.message : "Failed to submit signature.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isExpired = status === "expired";
  const isSigned = status === "signed" || status === "finalized";
  // The session could not be loaded (status stays null once a message is set).
  const loadFailed = status === null && message !== null;

  return (
    <div className="mx-auto w-full max-w-md">
      <Card className="gap-6">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-primary">Signature request</p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Signature for {roleLabel}</h1>
          {expiresAt ? <p className="text-sm text-muted-foreground">This link expires {formatDateTime(expiresAt)}.</p> : null}
        </div>
        {loadFailed ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>{message}</AlertTitle>
            <AlertDescription>Check that you opened the full link, or ask the person who sent it for a new one.</AlertDescription>
          </Alert>
        ) : message ? (
          <p role="status" className="text-sm text-foreground">
            {message}
          </p>
        ) : null}
        {loadFailed ? null : isExpired ? (
          <Alert variant="destructive">
            <Clock />
            <AlertDescription className="text-foreground">This signing session has expired. Please request a new link.</AlertDescription>
          </Alert>
        ) : isSigned ? (
          <div className="flex items-start gap-3 rounded-xl border border-success/40 bg-success/10 p-4 text-sm text-foreground">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            <span>Signature received. Thank you.</span>
          </div>
        ) : (
          <>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
              <li>Type your name (optional).</li>
              <li>Sign inside the box with your finger, a stylus or the mouse.</li>
              <li>Press the submit button. You can clear the box and start again first.</li>
            </ol>
            <Field label="Your name (optional)">
              <Input type="text" value={signerName} onChange={event => setSignerName(event.target.value)} autoComplete="name" placeholder="Name" />
            </Field>
            <div className="flex flex-col gap-2">
              <p id="signature-pad-label" className="text-sm font-medium text-foreground">
                Your signature
              </p>
              <div className="rounded-xl border border-border bg-muted p-2">
                {/* The pad's own colours are drawn into the saved image, so they are set in code above, not by the theme. */}
                <canvas
                  ref={canvasRef}
                  aria-labelledby="signature-pad-label"
                  className="h-48 w-full touch-none rounded-md border border-dashed border-border"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="lg" onClick={handleClear}>
                <Eraser aria-hidden="true" />
                Clear
              </Button>
              <Button type="button" size="lg" onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? "Submitting..." : "Submit signature"}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
