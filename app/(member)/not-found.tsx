import { NotFoundBody } from "@/src/components/public/NotFoundBody";

/** Missing records (notFound()) inside this route group get the same 404 as unknown addresses. */
export default function NotFound() {
  return <NotFoundBody />;
}
