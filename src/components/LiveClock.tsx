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
    <div className="flex items-center gap-2">
      <Clock className="h-4 w-4 text-current" />
      <div className="flex flex-col">
        <span className="text-sm font-semibold">{formatTime(currentTime)}</span>
        <span className="text-xs opacity-80">{formatDate(currentTime)}</span>
      </div>
    </div>
  );
};
