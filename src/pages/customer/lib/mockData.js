// Mock/demo data for the customer portal. Ported verbatim from customer/index.html.

export const PETS = [
  {
    id: 1,
    name: "Buddy",
    species: "Dog",
    breed: "Golden Retriever",
    sex: "Male",
    age: 3,
    color: "Golden",
    lastCheckup: "Sep 2, 2026",
    note: "Vaccinations up to date",
  },
  {
    id: 2,
    name: "Milo",
    species: "Cat",
    breed: "British Shorthair",
    sex: "Male",
    age: 2,
    color: "Gray",
    lastCheckup: "Aug 20, 2026",
    note: "Due for annual vaccination",
  },
];

export const CLINIC_STATUS = { isOpen: true, label: "Clinic is open now" };

export const CLINIC_HOURS = [
  { day: "Monday", jsDay: 1, hours: "8:00 AM – 6:00 PM" },
  { day: "Tuesday", jsDay: 2, hours: "8:00 AM – 6:00 PM" },
  { day: "Wednesday", jsDay: 3, hours: "8:00 AM – 6:00 PM" },
  { day: "Thursday", jsDay: 4, hours: "8:00 AM – 6:00 PM" },
  { day: "Friday", jsDay: 5, hours: "8:00 AM – 6:00 PM" },
  { day: "Saturday", jsDay: 6, hours: "9:00 AM – 2:00 PM" },
  { day: "Sunday", jsDay: 0, hours: "Closed", closed: true },
];

export const HOURS_BY_JSDAY = Object.fromEntries(CLINIC_HOURS.map((h) => [h.jsDay, h]));

// Mock admin-set exceptions that override the regular weekly schedule for a specific date.
export const ADMIN_CLOSURES = [
  { date: "2026-09-26", reason: "Staff training day" },
  { date: "2026-11-11", reason: "Public holiday" },
];

export const MOCK_GOOGLE_ACCOUNTS = [
  { name: "Alex Morgan", email: "alex.morgan@gmail.com" },
  { name: "Jamie Lee", email: "jamie.lee@gmail.com" },
];

export const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
export const MONTH_LABEL_FORMAT = { month: "long", year: "numeric" };
