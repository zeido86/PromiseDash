import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { startOfToday } from "date-fns";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      userId?: string;
      message?: string;
      habitTitle?: string;
      trackingType?: "BOOLEAN" | "NUMERIC";
      metricLabel?: string;
      targetValue?: number;
      goalComparator?: "GTE" | "LTE" | "EQ";
      endDate?: string;
    };
    const challengedId = body.userId?.trim();
    const message = body.message?.trim() ?? null;
    const habitTitle = body.habitTitle?.trim() || "Utmaning";
    const trackingType = body.trackingType === "NUMERIC" ? "NUMERIC" : "BOOLEAN";
    const metricLabel = body.metricLabel?.trim();
    const targetValue = typeof body.targetValue === "number" ? body.targetValue : null;
    const goalComparator = body.goalComparator ?? "GTE";
    const parsedEndDate = body.endDate ? new Date(body.endDate) : null;

    if (!challengedId) {
      return NextResponse.json({ error: "Mottagare saknas" }, { status: 400 });
    }
    if (habitTitle.length < 2 || habitTitle.length > 120) {
      return NextResponse.json({ error: "Löftets titel måste vara 2-120 tecken" }, { status: 400 });
    }
    if (trackingType === "NUMERIC" && !metricLabel) {
      return NextResponse.json({ error: "Namn på numeriskt värde saknas" }, { status: 400 });
    }
    if (trackingType === "NUMERIC" && targetValue != null && targetValue <= 0) {
      return NextResponse.json({ error: "Målvärde måste vara större än 0" }, { status: 400 });
    }
    if (!parsedEndDate || Number.isNaN(parsedEndDate.getTime())) {
      return NextResponse.json({ error: "Slutdatum saknas eller är ogiltigt" }, { status: 400 });
    }
    const today = startOfToday();
    if (parsedEndDate < today) {
      return NextResponse.json({ error: "Slutdatum kan inte vara tidigare än idag" }, { status: 400 });
    }

    if (challengedId === session.user.id) {
      return NextResponse.json({ error: "Du kan inte utmana dig själv" }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: challengedId },
      select: { id: true, username: true },
    });
    if (!targetUser?.username) {
      return NextResponse.json({ error: "Användaren hittades inte" }, { status: 404 });
    }

    const existingPending = await prisma.challenge.findFirst({
      where: {
        challengerId: session.user.id,
        challengedId,
        status: "PENDING",
      },
      select: { id: true },
    });
    if (existingPending) {
      return NextResponse.json({ error: "Du har redan en aktiv utmaning till den användaren" }, { status: 409 });
    }

    const challenge = await prisma.$transaction(async (tx) => {
      const created = await tx.challenge.create({
        data: {
          challengerId: session.user.id,
          challengedId,
          habitTitle,
          endDate: parsedEndDate,
          message: message || null,
        },
        select: {
          id: true,
          status: true,
          message: true,
          habitTitle: true,
          endDate: true,
          createdAt: true,
        },
      });

      const challengeDescription = targetUser.username
        ? `Utmaning mellan dig och @${targetUser.username}`
        : "Utmaning mellan två användare";

      await tx.habit.createMany({
        data: [
          {
            userId: session.user.id,
            challengeId: created.id,
            title: habitTitle,
            description: challengeDescription,
            templateType: "STANDARD",
            trackingType,
            metricLabel: trackingType === "NUMERIC" ? metricLabel : null,
            goalLabel: trackingType === "NUMERIC" && targetValue != null ? "Mål" : null,
            goalComparator: trackingType === "NUMERIC" && targetValue != null ? goalComparator : null,
            targetValue: trackingType === "NUMERIC" ? targetValue : null,
            frequencyType: "DAILY",
            scheduleMode: "FLEXIBLE",
            startDate: today,
            endDate: parsedEndDate,
          },
          {
            userId: challengedId,
            challengeId: created.id,
            title: habitTitle,
            description: challengeDescription,
            templateType: "STANDARD",
            trackingType,
            metricLabel: trackingType === "NUMERIC" ? metricLabel : null,
            goalLabel: trackingType === "NUMERIC" && targetValue != null ? "Mål" : null,
            goalComparator: trackingType === "NUMERIC" && targetValue != null ? goalComparator : null,
            targetValue: trackingType === "NUMERIC" ? targetValue : null,
            frequencyType: "DAILY",
            scheduleMode: "FLEXIBLE",
            startDate: today,
            endDate: parsedEndDate,
          },
        ],
      });

      return created;
    });

    return NextResponse.json(challenge, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Kunde inte skapa utmaning" }, { status: 500 });
  }
}
