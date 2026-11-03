import Image from "next/image";
import { cn } from "@/src/lib/utils";

type ThemeLogoProps = {
  className?: string;
  /** Use "" when a visible name sits next to the logo. */
  alt?: string;
  priority?: boolean;
};

/**
 * The GHMO logo in the right variant for the theme. Both images are in the page and CSS (`dark:`) picks
 * one, so there is no flash of the light logo in dark mode while the page loads.
 */
export default function ThemeLogo({ className, alt = "Greater Harrisburg Magar Organization logo", priority = false }: ThemeLogoProps) {
  return (
    <span className={cn("inline-flex size-28 shrink-0 items-center justify-center", className)}>
      <Image src="/assets/logo-light.png" alt={alt} width={240} height={240} priority={priority} className="size-full object-contain dark:hidden" />
      <Image src="/assets/logo-dark.png" alt={alt} width={240} height={240} priority={priority} className="hidden size-full object-contain dark:block" />
    </span>
  );
}
