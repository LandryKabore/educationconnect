import { useState, useEffect } from "react";
import { Clock } from "lucide-react";

export const LiveClock = () => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat(navigator.language, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  };

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat(navigator.language, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(date);
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-lg shadow-sm">
      <Clock className="h-5 w-5 text-primary" />
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-foreground">{formatTime(currentTime)}</span>
        <span className="text-xs text-muted-foreground">{formatDate(currentTime)}</span>
      </div>
    </div>
  );
};
