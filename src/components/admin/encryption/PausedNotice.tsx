/** One message for a failed device-list check, used by the strip on every encrypted page and by the Encryption page. */
export const PAUSED_TITLE = "Encryption is paused: the device list failed its check";
export const PAUSED_BODY =
  "The device list doesn't match what this device saw before, so it may have been changed outside the app. Nothing is unlocked, approved or shared on this device until it's sorted out.";
export const PAUSED_NEXT_STEP = "Don't approve devices or share anything. Tell your super admin now; they have the incident guide.";

/** The check's own words, for the super admin, folded away under "Details". */
export function PausedDetails({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer select-none">Details</summary>
      <p className="mt-1 break-words">{reason}</p>
    </details>
  );
}
