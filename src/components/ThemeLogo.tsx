"use client";

import Image from "next/image";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export default function ThemeLogo() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const src =
    resolvedTheme === "dark"
      ? "/assets/logo-dark.png"
      : "/assets/logo-light.png";

  return (
    <div className="mx-auto mb-4 inline-flex w-[120px] items-center justify-center sm:w-[180px] md:w-[220px] lg:w-[240px]">
      <Image
        src={mounted ? src : "/assets/logo-light.png"}
        alt="Greater Harrisburg Magar Organization logo"
        width={200}
        height={40}
        className="h-auto w-full object-contain"
        priority
      />
    </div>
  );
}
