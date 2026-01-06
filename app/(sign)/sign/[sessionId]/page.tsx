"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type SigningStatus = "pending" | "signed" | "expired" | "finalized" | "cancelled";

const ROLE_LABELS: Record<string, string> = {
  witness1: "Witness 1",
  witness2: "Witness 2",
  officiant: "Officiant",
  issuingAuthority: "Issuing Authority"
};

export default function SigningPage({ params }: { params: { sessionId: string } }) {
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
      const response = await fetch(`/api/signing-sessions/${params.sessionId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, signerName: signerName.trim() || undefined })
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

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="space-y-6 rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Signature request</p>
          <h1 className="text-2xl font-semibold text-slate-100">Signature for {roleLabel}</h1>
          {expiresAt ? (
            <p className="text-xs text-slate-500">Session expires at {new Date(expiresAt).toLocaleString()}</p>
          ) : null}
        </div>
        {message ? <p className="text-sm text-slate-300">{message}</p> : null}
        {isExpired ? (
          <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-200">
            This signing session has expired. Please request a new link.
          </div>
        ) : isSigned ? (
          <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            Signature received. Thank you.
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Signer name (optional)
              </label>
              <input
                type="text"
                value={signerName}
                onChange={event => setSignerName(event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
                placeholder="Name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Signature
              </label>
              <div className="rounded-2xl border border-slate-700 bg-slate-950 p-3">
                <canvas
                  ref={canvasRef}
                  className="h-48 w-full touch-none rounded-xl border border-dashed border-slate-700 bg-slate-950"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleClear}
                className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-primary"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="rounded-full bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Submitting..." : "Submit signature"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
