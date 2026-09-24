// Date/calendar helpers ported verbatim from customer/index.html.

import { ADMIN_CLOSURES, HOURS_BY_JSDAY } from "./mockData";

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function toDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function getMonthGrid(monthDate) {
  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const gridStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1 - firstOfMonth.getDay());
  return Array.from({ length: 42 }, (_, i) =>
    new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i)
  );
}

export function getDayAvailability(date) {
  const closure = ADMIN_CLOSURES.find((c) => c.date === toDateKey(date));
  if (closure) return { isOpen: false, hours: "Closed", reason: closure.reason };
  const weekday = HOURS_BY_JSDAY[date.getDay()];
  return { isOpen: !weekday.closed, hours: weekday.hours, reason: null };
}
