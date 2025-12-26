import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function PublicDocgenRedirect() {
  redirect("/admin/document-generator");
}
