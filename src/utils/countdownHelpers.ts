import { differenceInDays, differenceInHours, differenceInMinutes, isPast } from "date-fns";

export interface CountdownResult {
  display: string;
  urgent: boolean;
  overdue: boolean;
}

export const getCountdown = (dueDate: Date): CountdownResult => {
  const now = new Date();
  
  if (isPast(dueDate)) {
    return {
      display: "Overdue",
      urgent: false,
      overdue: true
    };
  }

  const days = differenceInDays(dueDate, now);
  const hours = differenceInHours(dueDate, now);
  const minutes = differenceInMinutes(dueDate, now);

  if (days > 7) {
    return {
      display: `${days} days`,
      urgent: false,
      overdue: false
    };
  } else if (days > 0) {
    return {
      display: `${days} day${days > 1 ? 's' : ''}`,
      urgent: days <= 2,
      overdue: false
    };
  } else if (hours > 0) {
    return {
      display: `${hours} hour${hours > 1 ? 's' : ''}`,
      urgent: true,
      overdue: false
    };
  } else {
    return {
      display: `${minutes} min${minutes > 1 ? 's' : ''}`,
      urgent: true,
      overdue: false
    };
  }
};