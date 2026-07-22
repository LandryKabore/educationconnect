import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  senderName: string;
  body: string;
  dateLabel: string;
  seenLabel?: string | null;
  isNew?: boolean;
  footer?: ReactNode;
  className?: string;
};

export function AnnouncementPaper({
  title,
  senderName,
  body,
  dateLabel,
  seenLabel,
  isNew,
  footer,
  className,
}: Props) {
  return (
    <article className={cn("announcement-paper", className)}>
      <div className="announcement-paper__inner">
        <header className="announcement-paper__head">
          <div className="announcement-paper__stamp" aria-hidden>
            Annonce
          </div>
          <div className="min-w-0 flex-1">
            <p className="announcement-paper__eyebrow">Établissement · {dateLabel}</p>
            <h2 className="announcement-paper__title">{title}</h2>
            <p className="announcement-paper__from">De {senderName}</p>
          </div>
          {isNew ? (
            <span className="announcement-paper__new">Nouveau</span>
          ) : seenLabel ? (
            <span className="announcement-paper__seen">{seenLabel}</span>
          ) : null}
        </header>

        <div className="announcement-paper__rule" aria-hidden />

        <p className="announcement-paper__body">{body}</p>

        {footer ? <footer className="announcement-paper__foot">{footer}</footer> : null}
      </div>
    </article>
  );
}
