import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** Image size classes (default fits sidebar). */
  imgClassName?: string;
  /** Hide the wordmark when the image already includes it (default true — show image only). */
  alt?: string;
  /** Image file in /public (default: the square logo used in the shell). */
  file?: string;
};

/** EduFaso brand mark — used in shell, login, etc. */
export function BrandLogo({
  className,
  imgClassName,
  alt = "EduFaso",
  file = "edufaso-logo.png",
}: Props) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}${file}`}
      alt={alt}
      className={cn("object-contain", imgClassName, className)}
      decoding="async"
    />
  );
}
