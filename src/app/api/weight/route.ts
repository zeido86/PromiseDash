import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { normalizeToDay } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { createWeightEntrySchema } from "@/lib/validators";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = createWeightEntrySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ogiltig indata", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (parsed.data.startWeight) {
      await prisma.weightProfile.upsert({
        where: { userId: session.user.id },
        update: {
          startWeight: parsed.data.startWeight,
          weighInWeekday: parsed.data.weighInWeekday ?? 5,
        },
        create: {
          userId: session.user.id,
          startWeight: parsed.data.startWeight,
          weighInWeekday: parsed.data.weighInWeekday ?? 5,
        },
      });
    }

    const entryDate = normalizeToDay(parsed.data.date);

    const entry = await prisma.weightEntry.upsert({
      where: { userId_date: { userId: session.user.id, date: entryDate } },
      update: { weight: parsed.data.weight },
      create: {
        userId: session.user.id,
        date: entryDate,
        weight: parsed.data.weight,
      },
    });

    return NextResponse.json(entry);
  } catch {
    return NextResponse.json({ error: "Kunde inte spara vikt" }, { status: 500 });
  }
}
