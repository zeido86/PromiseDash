import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { normalizeToDay } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { createCalorieEntrySchema } from "@/lib/validators";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = createCalorieEntrySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ogiltig indata", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const target = parsed.data.dailyTarget ?? 2200;
    await prisma.calorieProfile.upsert({
      where: { userId: session.user.id },
      update: { dailyTarget: target },
      create: { userId: session.user.id, dailyTarget: target },
    });

    const entryDate = normalizeToDay(parsed.data.date);
    const net = parsed.data.intake - parsed.data.burn;
    const dailyDelta = target - net;

    await prisma.calorieEntry.upsert({
      where: { userId_date: { userId: session.user.id, date: entryDate } },
      update: { intake: parsed.data.intake, burn: parsed.data.burn },
      create: {
        userId: session.user.id,
        date: entryDate,
        intake: parsed.data.intake,
        burn: parsed.data.burn,
      },
    });

    const previous = await prisma.calorieBalance.findFirst({
      where: { userId: session.user.id, date: { lt: entryDate } },
      orderBy: { date: "desc" },
    });

    const runningBalance = (previous?.runningBalance ?? 0) + dailyDelta;
    const balance = await prisma.calorieBalance.upsert({
      where: { userId_date: { userId: session.user.id, date: entryDate } },
      update: { dailyDelta, runningBalance },
      create: {
        userId: session.user.id,
        date: entryDate,
        dailyDelta,
        runningBalance,
      },
    });

    return NextResponse.json(balance);
  } catch {
    return NextResponse.json({ error: "Kunde inte spara kalorier" }, { status: 500 });
  }
}
