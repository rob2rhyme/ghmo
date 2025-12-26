import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function PublicGumbaProjectRedirect() {
  redirect("/admin/gumba-project");
}
