import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import EncryptionPanel from "@/src/components/admin/encryption/EncryptionPanel";

export const dynamic = "force-dynamic";

// Access is enforced by the admin layout (passkey session required).
export default function AdminEncryptionPage() {
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Encryption"
        description="End-to-end encryption keys for this device, other admins' devices and the recovery key."
      />
      <EncryptionPanel />
    </div>
  );
}
