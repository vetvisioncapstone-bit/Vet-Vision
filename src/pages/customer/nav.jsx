// Side navigation structure, ported verbatim from customer/index.html.

import { CalendarIcon, HomeIcon, RecordsIcon, SettingsIcon } from "./components/icons";

export const NAV_GROUPS = [
  {
    label: "Main",
    items: [
      { id: "home", label: "Home", icon: <HomeIcon /> },
      { id: "calendar", label: "Calendar", icon: <CalendarIcon /> },
    ],
  },
  {
    label: "Records",
    items: [{ id: "records", label: "Records", icon: <RecordsIcon /> }],
  },
  {
    label: "Account",
    items: [{ id: "settings", label: "Settings", icon: <SettingsIcon /> }],
  },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);
