import { addDays } from "date-fns";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { normalizeToDay } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { createHabitEntrySchema } from "@/lib/validators";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = createHabitEntrySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ogiltig indata", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const habit = await prisma.habit.findFirst({
      where: { id: parsed.data.habitId, userId: session.user.id },
      select: {
        id: true,
        frequencyType: true,
        scheduleMode: true,
        weekdays: true,
      },
    });

    if (!habit) {
      return NextResponse.json({ error: "Löfte hittades inte" }, { status: 404 });
    }

    const baseDate = normalizeToDay(parsed.data.date);
    let entryDate = baseDate;

    // For fixed weekdays, pre-log values are bound to the next scheduled day.
    // Example: Thursday input for Friday habit is saved on Friday directly.
    if (
      habit.frequencyType === "WEEKDAYS" &&
      habit.scheduleMode === "FIXED" &&
      habit.weekdays.length > 0 &&
      !habit.weekdays.includes(baseDate.getDay())
    ) {
      for (let offset = 1; offset <= 7; offset += 1) {
        const candidate = normalizeToDay(addDays(baseDate, offset));
        if (habit.weekdays.includes(candidate.getDay())) {
          entryDate = candidate;
          break;
        }
      }
    }

    const entry = await prisma.habitEntry.upsert({
      where: { habitId_date: { habitId: parsed.data.habitId, date: entryDate } },
      update: {
        checked: parsed.data.checked,
        numericValue: parsed.data.numericValue,
        note: parsed.data.note,
      },
      create: {
        habitId: parsed.data.habitId,
        userId: session.user.id,
        date: entryDate,
        checked: parsed.data.checked,
        numericValue: parsed.data.numericValue,
        note: parsed.data.note,
      },
    });

    return NextResponse.json(entry);
  } catch {
    return NextResponse.json({ error: "Kunde inte spara dagsregistrering" }, { status: 500 });
  }
}
