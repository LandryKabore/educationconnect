import { format, isToday, isTomorrow, differenceInHours, differenceInDays, addDays, startOfDay, endOfDay } from "date-fns";

export const formatDueDate = (date: Date): string => {
  if (isToday(date)) {
    return `Today ${format(date, 'h:mm a')}`;
  } else if (isTomorrow(date)) {
    return `Tomorrow ${format(date, 'h:mm a')}`;
  } else {
    const daysDiff = differenceInDays(date, new Date());
    if (daysDiff <= 7) {
      return format(date, 'EEEE h:mm a');
    }
    return format(date, 'MMM d, h:mm a');
  }
};

export const formatMessageTime = (date: Date): string => {
  const hoursDiff = differenceInHours(new Date(), date);
  if (hoursDiff < 1) {
    return 'Just now';
  } else if (hoursDiff < 24) {
    return `${hoursDiff} hour${hoursDiff > 1 ? 's' : ''} ago`;
  } else {
    const daysDiff = differenceInDays(new Date(), date);
    if (daysDiff === 1) {
      return '1 day ago';
    } else if (daysDiff <= 7) {
      return `${daysDiff} days ago`;
    }
    return format(date, 'MMM d');
  }
};

export const getCurrentDate = () => new Date();

export const getTodayStart = () => startOfDay(new Date());

export const getTodayEnd = () => endOfDay(new Date());

export const getWeeklySchedule = (dayOfWeek: number) => {
  const schedules = {
    1: ["8:00 AM", "10:00 AM", "1:00 PM", "3:00 PM"], // Monday
    2: ["9:00 AM", "11:00 AM", "2:00 PM", "4:00 PM"], // Tuesday  
    3: ["8:30 AM", "10:30 AM", "1:30 PM", "3:30 PM"], // Wednesday
    4: ["9:00 AM", "11:00 AM", "2:00 PM", "4:00 PM"], // Thursday
    5: ["8:00 AM", "10:00 AM", "12:00 PM", "2:00 PM"]  // Friday
  };
  
  return schedules[dayOfWeek as keyof typeof schedules] || schedules[1];
};

export const isTaskOverdue = (dueDate: Date): boolean => {
  return dueDate < new Date();
};

export const isTaskDueToday = (dueDate: Date): boolean => {
  return isToday(dueDate);
};

export const isTaskDueSoon = (dueDate: Date, hoursThreshold: number = 24): boolean => {
  const hoursDiff = differenceInHours(dueDate, new Date());
  return hoursDiff <= hoursThreshold && hoursDiff > 0;
};

export const generateTaskDueDates = () => {
  const now = new Date();
  return {
    today: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0), // Today 5PM
    tomorrow: addDays(now, 1),
    todayAfternoon: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 15, 0), // Today 3PM
    thisWeek: addDays(now, 5), // This Friday
    nextWeek: addDays(now, 7)
  };
};