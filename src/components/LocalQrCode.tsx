"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

type LocalQrCodeProps = {
  value: string;
  size?: number;
  className?: string;
  alt: string;
};

/**
 * Renders a QR code entirely in the browser.
 * Never use a remote QR service: QR payloads here include secret signing links.
 */
export default function LocalQrCode({ value, size = 220, className, alt }: LocalQrCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { width: size, margin: 1, errorCorrectionLevel: "M" })
      .then(url => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl(null);
      });
    return () => {
      active = false;
    };
  }, [value, size]);

  if (!dataUrl) {
    return <div role="img" aria-label={alt} className={className} />;
  }
  // eslint-disable-next-line @next/next/no-img-element -- data: URL generated locally
  return <img src={dataUrl} alt={alt} width={size} height={size} className={className} />;
}
