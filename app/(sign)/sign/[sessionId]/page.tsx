"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  issuingAuthority: "Issuing authority"
};

type SealTarget = { epoch: number; publicJwk: PublicJwk };

const ASK_FOR_NEW_LINK = "Ask the person who sent it for a new link.";
const SUBMIT_FAILED = "Your signature couldn't be sent. Try again in a few minutes, or ask the person who sent the link for a new one.";

/** What a signer sees for each answer from the server. The server's own wording is never shown. */
function submitErrorMessage(status: number): string {
  if (status === 400) return "Your signature couldn't be read. Clear the box, sign again and submit.";
  if (status === 404) return `This signing link isn't valid. ${ASK_FOR_NEW_LINK}`;
  if (status === 429) return "Too many tries. Wait a few minutes, then submit again.";
  return SUBMIT_FAILED;
}

/** Load failures: only a 404 means the link itself is wrong; anything else is on our side. */
function loadErrorMessage(status: number | null): { title: string; detail: string } {
  if (status === 404) return { title: "This signing link isn't valid.", detail: `Check that you opened the full link. ${ASK_FOR_NEW_LINK}` };
  return { title: "Signing isn't available right now.", detail: "Try again in a few minutes. Your link still works until it expires." };
}

type SessionPayload = {
  status?: SigningStatus;
  role?: string | null;
  expiresAt?: string | null;
  seal?: SealTarget | null;
  /** Not sent yet: the name of the document being signed, e.g. "Wedding certificate". */
  documentTitle?: unknown;
};
type SessionRead = { ok: true; payload: SessionPayload } | { ok: false; error: { title: string; detail: string } };

async function readSession(sessionId: string): Promise<SessionRead> {
  try {
    const response = await fetch(`/api/signing-sessions/${sessionId}`);
    if (!response.ok) return { ok: false, error: loadErrorMessage(response.status) };
    return { ok: true, payload: (await response.json()) as SessionPayload };
  } catch (error) {
    console.error("Failed to load signing session", error);
    return { ok: false, error: loadErrorMessage(null) };
  }
}

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
  const [documentTitle, setDocumentTitle] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<{ title: string; detail: string } | null>(null);
  const [padError, setPadError] = useState<string | null>(null);
  /** True once the person has drawn something in the box since it was last cleared. */
  const hasInk = useRef(false);
  /** This page sent the signature (as opposed to opening a link that was already used). */
  const [justSigned, setJustSigned] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const roleLabel = useMemo(() => (role ? ROLE_LABELS[role] ?? role : "Signer"), [role]);

  /** Shows what was read; returns the session's status, or null when it couldn't be read. */
  const showSession = useCallback((read: SessionRead): SigningStatus | null => {
    if (!read.ok) {
      setLoadError(read.error);
      return null;
    }
    const { payload } = read;
    const next: SigningStatus = payload.status ?? "pending";
    setStatus(next);
    setRole(payload.role ?? null);
    setExpiresAt(payload.expiresAt ?? null);
    setSeal(payload.seal ?? null);
    setDocumentTitle(typeof payload.documentTitle === "string" && payload.documentTitle ? payload.documentTitle : null);
    return next;
  }, []);

  useEffect(() => {
    let live = true;
    void readSession(params.sessionId).then(read => {
      if (live) showSession(read);
    });
    return () => {
      live = false;
    };
  }, [params.sessionId, showSession]);

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
      hasInk.current = true;
      setPadError(null);
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
    hasInk.current = false;
  };

  const handleSubmit = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setMessage(null);
    if (!hasInk.current) {
      setPadError("Sign inside the box first.");
      return;
    }
    setIsSubmitting(true);
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
      if (response.ok) {
        setJustSigned(true);
        setStatus("signed");
        return;
      }
      if (response.status === 410) {
        setStatus("expired");
        return;
      }
      if (response.status === 409) {
        // Either the link was already used, or the signing keys changed. Reading the session again tells which,
        // and picks up the new key so the same drawing can be sent again.
        const now = showSession(await readSession(params.sessionId));
        if (now === null) setMessage(SUBMIT_FAILED);
        else if (now === "pending") setMessage("Something changed on our side. Press Submit signature again.");
        return;
      }
      setMessage(submitErrorMessage(response.status));
    } catch (error) {
      console.error("Signature submit failed", error);
      setMessage(SUBMIT_FAILED);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isExpired = status === "expired";
  const isCancelled = status === "cancelled";
  const isSigned = status === "signed" || status === "finalized";
  // The session could not be loaded (status stays null).
  const loadFailed = status === null && loadError !== null;
  const what = documentTitle ? `a ${documentTitle.toLowerCase()}` : "a certificate";

  return (
    <div className="mx-auto w-full max-w-md">
      <Card className="gap-6">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-primary">Signature request</p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Signature for {roleLabel}</h1>
          {role ? (
            <p className="text-base text-foreground">
              You&apos;re signing {what} from the Greater Harrisburg Magar Organization (GHMO) as {roleLabel}.
            </p>
          ) : null}
          {expiresAt && !isSigned ? <p className="text-sm text-muted-foreground">This link expires {formatDateTime(expiresAt)}.</p> : null}
        </div>
        {loadFailed && loadError ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>{loadError.title}</AlertTitle>
            <AlertDescription>{loadError.detail}</AlertDescription>
          </Alert>
        ) : message ? (
          <Alert variant="destructive" role="alert">
            <AlertTriangle />
            <AlertDescription className="text-foreground">{message}</AlertDescription>
          </Alert>
        ) : null}
        {loadFailed ? null : isExpired ? (
          <Alert variant="destructive">
            <Clock />
            <AlertDescription className="text-foreground">This link has expired. {ASK_FOR_NEW_LINK}</AlertDescription>
          </Alert>
        ) : isCancelled ? (
          <Alert variant="destructive">
            <Clock />
            <AlertDescription className="text-foreground">This signing request was canceled. {ASK_FOR_NEW_LINK}</AlertDescription>
          </Alert>
        ) : isSigned ? (
          <div role="status" className="flex items-start gap-3 rounded-xl border border-success/40 bg-success/10 p-4 text-sm text-foreground">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            <span>
              {justSigned
                ? "Signature received. Thank you. You can close this page."
                : "This link has already been used to sign. There is nothing more to do here."}
            </span>
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
                  aria-describedby={padError ? "signature-pad-error" : undefined}
                  className="h-48 w-full touch-none rounded-md border border-dashed border-border"
                />
              </div>
              {padError ? (
                <p id="signature-pad-error" role="alert" className="text-sm font-medium text-destructive">
                  {padError}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="lg" onClick={handleClear}>
                <Eraser aria-hidden="true" />
                Clear
              </Button>
              <Button type="button" size="lg" onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? "Submitting…" : "Submit signature"}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
