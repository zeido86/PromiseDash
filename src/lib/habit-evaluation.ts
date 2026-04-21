type HabitLike = {
  trackingType: "BOOLEAN" | "NUMERIC";
  targetValue: number | null;
  goalComparator: "GTE" | "LTE" | "EQ" | null;
};

type EntryLike = {
  checked: boolean | null;
  numericValue: number | null;
};

export function isEntryCompleted(habit: HabitLike, entry: EntryLike | null | undefined) {
  if (!entry) {
    return false;
  }

  if (habit.trackingType === "BOOLEAN") {
    return entry.checked === true;
  }

  if (entry.numericValue == null) {
    return false;
  }

  if (habit.targetValue == null) {
    return entry.numericValue > 0;
  }

  switch (habit.goalComparator) {
    case "LTE":
      return entry.numericValue <= habit.targetValue;
    case "EQ":
      return entry.numericValue === habit.targetValue;
    case "GTE":
    default:
      return entry.numericValue >= habit.targetValue;
  }
}
