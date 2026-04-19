import Image from "next/image";

import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  withWordmark?: boolean;
  size?: "sm" | "md" | "lg";
};

const sizeClasses: Record<NonNullable<BrandLogoProps["size"]>, string> = {
  sm: "h-6 w-auto",
  md: "h-8 w-auto",
  lg: "h-10 w-auto",
};

export default function BrandLogo({
  className,
  withWordmark = true,
  size = "md",
}: BrandLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <Image
        src="/nexapay-logo.svg"
        alt="NexaPay logo"
        width={152}
        height={94}
        className={sizeClasses[size]}
        priority
      />
      {withWordmark ? <span className="text-lg font-semibold text-white">NexaPay</span> : null}
    </span>
  );
}
