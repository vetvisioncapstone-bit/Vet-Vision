// Clinic calendar: which days the owner's branch is open, from the API (regular schedule plus the
// admin's per-date closures). Green = open, amber = half day, red = closed.

import { useMemo, useState } from "react";
import { MONTH_LABEL_FORMAT, WEEKDAY_LABELS } from "../lib/mockData";
import { useClinicCalendar } from "../../../hooks/useCustomerPortal";
import { getMonthGrid, isSameDay, toDateKey } from "../lib/dateUtils";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

const DOT = { open: "cal__day-dot--open", half: "cal__day-dot--half", closed: "cal__day-dot--closed" };

export default function ClinicCalendar() {
  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);

  const days = useMemo(() => getMonthGrid(month), [month]);
  const { days: schedule, loading } = useClinicCalendar(toDateKey(days[0]), toDateKey(days[days.length - 1]));
  const availability = (date) => schedule[toDateKey(date)];
  const selected = availability(selectedDate);

  function goToMonth(offset) {
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + offset, 1));
  }

  return (
    <div className="cal">
      <div className="cal__header">
        <button type="button" className="cal__nav-btn" onClick={() => goToMonth(-1)} aria-label="Previous month">
          <ChevronLeftIcon />
        </button>
        <p className="cal__month">{month.toLocaleDateString(undefined, MONTH_LABEL_FORMAT)}</p>
        <button type="button" className="cal__nav-btn" onClick={() => goToMonth(1)} aria-label="Next month">
          <ChevronRightIcon />
        </button>
      </div>

      <div className="cal__weekdays">
        {WEEKDAY_LABELS.map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>

      <div className="cal__grid">
        {days.map((date) => {
          const info = availability(date);
          const classes = [
            "cal__day",
            date.getMonth() !== month.getMonth() && "cal__day--muted",
            isSameDay(date, today) && "cal__day--today",
            isSameDay(date, selectedDate) && "cal__day--selected",
          ].filter(Boolean).join(" ");

          return (
            <button type="button" key={date.toISOString()} className={classes} onClick={() => setSelectedDate(date)}>
              <span className="cal__day-num">{date.getDate()}</span>
              {info && <span className={`cal__day-dot ${DOT[info.state]}`} />}
            </button>
          );
        })}
      </div>

      <div className="cal__legend">
        <span><span className="cal__day-dot cal__day-dot--open" /> Open</span>
        <span><span className="cal__day-dot cal__day-dot--half" /> Half day</span>
        <span><span className="cal__day-dot cal__day-dot--closed" /> Closed</span>
      </div>

      <div className={`cal__detail ${selected && selected.state !== "closed" ? "cal__detail--open" : "cal__detail--closed"}`}>
        <p className="cal__detail-date">
          {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <p className="cal__detail-status">
          {!selected ? (loading ? "Loading…" : "") : selected.state === "closed" ? "Closed" : `Open · ${selected.hours}`}
          {selected?.reason ? ` — ${selected.reason}` : ""}
        </p>
      </div>
    </div>
  );
}
