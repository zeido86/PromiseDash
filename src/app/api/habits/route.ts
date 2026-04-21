import { GoalComparator, HabitFrequencyType, HabitScheduleMode } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createHabitSchema } from "@/lib/validators";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const habits = await prisma.habit.findMany({
    where: { userId: session.user.id },
    include: { category: true, entries: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(habits);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = createHabitSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ogiltig indata", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    let categoryId: string | null = null;
    if (parsed.data.category) {
      const category = await prisma.category.upsert({
        where: { userId_name: { userId: session.user.id, name: parsed.data.category } },
        update: {},
        create: {
          userId: session.user.id,
          name: parsed.data.category,
        },
      });
      categoryId = category.id;
    }

    const habit = await prisma.habit.create({
      data: {
        userId: session.user.id,
        categoryId,
        title: parsed.data.title,
        templateType: parsed.data.templateType,
        description: parsed.data.description,
        trackingType: parsed.data.trackingType,
        metricLabel: parsed.data.metricLabel,
        goalLabel: parsed.data.goalLabel,
        goalComparator: (parsed.data.goalComparator as GoalComparator | undefined) ?? null,
        frequencyType: parsed.data.frequencyType as HabitFrequencyType,
        weeklyTarget: parsed.data.weeklyTarget,
        scheduleMode: (parsed.data.scheduleMode as HabitScheduleMode | undefined) ?? "FLEXIBLE",
        weekdays: parsed.data.weekdays ?? [],
        startValue: parsed.data.startValue,
        targetValue: parsed.data.targetValue,
        milestonesEnabled: parsed.data.milestonesEnabled ?? false,
        milestoneStep: null,
        unit: parsed.data.unit,
        startDate: new Date(parsed.data.startDate),
        endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
      },
      include: { category: true },
    });

    if (parsed.data.setupWeightProfile) {
      await prisma.weightProfile.upsert({
        where: { userId: session.user.id },
        update: {
          startWeight: parsed.data.setupWeightProfile.startWeight,
          weighInWeekday: parsed.data.setupWeightProfile.weighInWeekday ?? 5,
        },
        create: {
          userId: session.user.id,
          startWeight: parsed.data.setupWeightProfile.startWeight,
          weighInWeekday: parsed.data.setupWeightProfile.weighInWeekday ?? 5,
        },
      });
    }

    if (parsed.data.setupCalorieProfile) {
      await prisma.calorieProfile.upsert({
        where: { userId: session.user.id },
        update: {
          dailyTarget: parsed.data.setupCalorieProfile.dailyTarget,
        },
        create: {
          userId: session.user.id,
          dailyTarget: parsed.data.setupCalorieProfile.dailyTarget,
        },
      });
    }

    return NextResponse.json(habit, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Kunde inte skapa löfte" }, { status: 500 });
  }
}
