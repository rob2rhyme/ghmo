import Image from "next/image";
import { cn } from "@/src/lib/utils";

type ThemeLogoProps = {
  className?: string;
  /** Use "" when a visible name sits next to the logo. */
  alt?: string;
  priority?: boolean;
  /**
   * The slot's drawn width (CSS), so phones fetch a small copy instead of the 640 px one. Match it to the
   * size class: "36px" for size-9, "48px" for size-12. The default fits the default size-28.
   */
  sizes?: string;
};

/**
 * The GHMO logo in the right variant for the theme. Both images are in the page and CSS (`dark:`) picks
 * one, so there is no flash of the light logo in dark mode while the page loads.
 */
export default function ThemeLogo({ className, alt = "Greater Harrisburg Magar Organization logo", priority = false, sizes = "112px" }: ThemeLogoProps) {
  return (
    <span className={cn("inline-flex size-28 shrink-0 items-center justify-center", className)}>
      <Image src="/assets/logo-light.png" alt={alt} width={240} height={240} sizes={sizes} priority={priority} className="size-full object-contain dark:hidden" />
      <Image src="/assets/logo-dark.png" alt={alt} width={240} height={240} sizes={sizes} priority={priority} className="hidden size-full object-contain dark:block" />
    </span>
  );
}
