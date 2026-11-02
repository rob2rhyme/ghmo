import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** The public story of the Gumba Project lives on the Donate page. Board members use /admin/gumba-project. */
export default function PublicGumbaProjectRedirect() {
  permanentRedirect("/donate");
}
