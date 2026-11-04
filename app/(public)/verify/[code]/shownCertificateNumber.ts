import { getTemplateById } from "@/src/features/docgen/templates";

/**
 * The certificate number to show on the check page. Certificates issued before numbers were assigned
 * automatically could carry the template's id ("wedding-certificate") instead; that is not a number, so none
 * is shown.
 */
export function shownCertificateNumber(certificateId: string | undefined | null): string | null {
  const value = certificateId?.trim();
  if (!value || getTemplateById(value)) return null;
  return value;
}
