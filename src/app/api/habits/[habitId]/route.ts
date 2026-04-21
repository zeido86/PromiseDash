import { GoalComparator, HabitTrackingType } from "@prisma/client";
import { parseISO, startOfDay } from "date-fns";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateHabitSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ habitId: string }>;
};

export async function PATCH(req: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { habitId } = await context.params;

  try {
    const json = await req.json();
    const parsed = updateHabitSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ogiltig indata", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const habit = await prisma.habit.findFirst({
      where: { id: habitId, userId: session.user.id, status: "ACTIVE" },
      select: {
        id: true,
        trackingType: true,
        startDate: true,
        challengeId: true,
        goalComparator: true,
      },
    });

    if (!habit) {
      return NextResponse.json({ error: "Löftet hittades inte" }, { status: 404 });
    }

    const data: {
      endDate?: Date | null;
      targetValue?: number | null;
      goalComparator?: GoalComparator | null;
    } = {};

    if (parsed.data.endDate !== undefined) {
      if (habit.challengeId) {
        return NextResponse.json(
          { error: "Slutdatum styrs av utmaningen och kan inte ändras här." },
          { status: 403 },
        );
      }
      if (parsed.data.endDate === null) {
        data.endDate = null;
      } else {
        const endDay = startOfDay(parseISO(parsed.data.endDate));
        const startDay = startOfDay(habit.startDate);
        if (endDay < startDay) {
          return NextResponse.json(
            { error: "Slutdatum får inte vara före startdatum" },
            { status: 400 },
          );
        }
        data.endDate = endDay;
      }
    }

    if (parsed.data.targetValue !== undefined) {
      if (habit.trackingType !== HabitTrackingType.NUMERIC) {
        return NextResponse.json({ error: "Målvärde gäller bara numeriska löften." }, { status: 400 });
      }
      data.targetValue = parsed.data.targetValue;
      data.goalComparator =
        (parsed.data.goalComparator as GoalComparator | undefined) ??
        habit.goalComparator ??
        GoalComparator.GTE;
    } else if (parsed.data.goalComparator !== undefined) {
      if (habit.trackingType !== HabitTrackingType.NUMERIC) {
        return NextResponse.json({ error: "Målregeln gäller bara numeriska löften." }, { status: 400 });
      }
      data.goalComparator = parsed.data.goalComparator as GoalComparator;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Inget att uppdatera" }, { status: 400 });
    }

    const updated = await prisma.habit.update({
      where: { id: habitId },
      data,
      select: {
        id: true,
        targetValue: true,
        goalComparator: true,
        endDate: true,
      },
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Kunde inte uppdatera löftet" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { habitId } = await context.params;

  const habit = await prisma.habit.findFirst({
    where: { id: habitId, userId: session.user.id },
    select: { id: true },
  });

  if (!habit) {
    return NextResponse.json({ error: "Lofte hittades inte" }, { status: 404 });
  }

  await prisma.habit.delete({
    where: { id: habitId },
  });

  return NextResponse.json({ ok: true });
}
