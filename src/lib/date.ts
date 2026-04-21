import { parseISO, startOfDay } from "date-fns";

export function normalizeToDay(dateInput: string | Date) {
  const date = typeof dateInput === "string" ? parseISO(dateInput) : dateInput;
  return startOfDay(date);
}
