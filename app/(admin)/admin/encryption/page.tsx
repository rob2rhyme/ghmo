import type { Metadata } from "next";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import EncryptionPanel from "@/src/components/admin/encryption/EncryptionPanel";

/** Tab title: "Encryption · GHMO admin" (the admin layout adds the suffix). */
export const metadata: Metadata = { title: "Encryption" };


export const dynamic = "force-dynamic";

// Access is enforced by the admin layout (passkey session required).
export default function AdminEncryptionPage() {
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Encryption"
        description="Keeps admin chat, plans, phone numbers and other private records readable only on admins' approved devices."
      />
      <EncryptionPanel />
    </div>
  );
}
