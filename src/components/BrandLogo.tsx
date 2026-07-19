import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** Image size classes (default fits sidebar). */
  imgClassName?: string;
  /** Hide the wordmark when the image already includes it (default true — show image only). */
  alt?: string;
};

/** EduFaso brand mark — used in shell, login, etc. */
export function BrandLogo({
  className,
  imgClassName,
  alt = "EduFaso",
}: Props) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}edufaso-logo.png`}
      alt={alt}
      className={cn("object-contain", imgClassName, className)}
      decoding="async"
    />
  );
}
