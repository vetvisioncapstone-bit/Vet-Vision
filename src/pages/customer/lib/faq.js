// FAQ data + rule-based matching logic, ported verbatim from customer/index.html.

import { CLINIC_HOURS, CLINIC_STATUS } from "./mockData";

export function buildHoursSummary() {
  const open = CLINIC_HOURS.filter((h) => !h.closed);
  const closed = CLINIC_HOURS.filter((h) => h.closed);
  let summary = open.map((h) => `${h.day} ${h.hours}`).join(", ");
  if (closed.length) summary += `. Closed on ${closed.map((h) => h.day).join(", ")}.`;
  return summary;
}

export const FAQ_ITEMS = [
  {
    id: "hours",
    label: "What are your clinic hours?",
    keywords: ["hour", "time", "schedule", "when"],
    answer: buildHoursSummary(),
  },
  {
    id: "open-now",
    label: "Are you open right now?",
    keywords: ["open now", "open today", "currently open", "are you open"],
    answer: CLINIC_STATUS.isOpen
      ? `Yes — ${CLINIC_STATUS.label.toLowerCase()}.`
      : `Not right now — ${CLINIC_STATUS.label.toLowerCase()}.`,
  },
  {
    id: "appointment",
    label: "Do I need an appointment?",
    keywords: ["appointment", "book", "booking", "reserve", "walk"],
    answer: "Walk-ins are welcome, but booking ahead helps us prepare for your visit. Check the Calendar page for our availability.",
  },
  {
    id: "services",
    label: "What services do you offer?",
    keywords: ["service", "offer", "vaccine", "vaccination", "checkup", "surgery", "dental"],
    answer: "We offer wellness checkups, vaccinations, dental care, and minor procedures. Ask our front desk for the full list of services.",
  },
  {
    id: "records",
    label: "How do I see my pet's records?",
    keywords: ["record", "medical", "history"],
    answer: "Open the Records page from the side menu to view your pet's medical summary.",
  },
  {
    id: "emergency",
    label: "What if it's an emergency?",
    keywords: ["emergency", "urgent", "critical"],
    answer: "For emergencies outside clinic hours, please head to your nearest 24-hour emergency animal hospital right away.",
  },
];

export const FAQ_FALLBACK =
  "I'm not sure about that one yet — try asking about our hours, appointments, services, or records, or reach out to the clinic directly.";

export function findFaqAnswer(text) {
  const normalized = text.toLowerCase();
  const match = FAQ_ITEMS.find((item) => item.keywords.some((k) => normalized.includes(k)));
  return match ? match.answer : FAQ_FALLBACK;
}
