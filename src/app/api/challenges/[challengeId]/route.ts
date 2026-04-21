import { ChallengeStatus, HabitStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ challengeId: string }> };

export async function PATCH(req: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { challengeId } = await context.params;
    const body = (await req.json()) as { status?: ChallengeStatus };
    const nextStatus = body.status;

    if (nextStatus !== "ACCEPTED" && nextStatus !== "DECLINED" && nextStatus !== "CANCELLED") {
      return NextResponse.json({ error: "Ogiltig status" }, { status: 400 });
    }

    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
      select: { id: true, challengedId: true, challengerId: true, status: true },
    });

    if (!challenge) {
      return NextResponse.json({ error: "Utmaningen hittades inte" }, { status: 404 });
    }

    if (nextStatus !== "CANCELLED" && challenge.status !== "PENDING") {
      return NextResponse.json({ error: "Utmaningen är redan hanterad" }, { status: 409 });
    }

    if (nextStatus === "CANCELLED") {
      const isParticipant = challenge.challengerId === session.user.id || challenge.challengedId === session.user.id;
      if (!isParticipant) {
        return NextResponse.json({ error: "Endast deltagare kan avsluta utmaningen" }, { status: 403 });
      }
    } else if (challenge.challengedId !== session.user.id) {
      return NextResponse.json({ error: "Endast mottagaren kan svara på utmaningen" }, { status: 403 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const challengeUpdated = await tx.challenge.update({
        where: { id: challengeId },
        data: { status: nextStatus },
        select: { id: true, status: true, updatedAt: true },
      });

      if (nextStatus === "CANCELLED") {
        await tx.habit.updateMany({
          where: { challengeId },
          data: { status: HabitStatus.COMPLETED },
        });
      }

      return challengeUpdated;
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Kunde inte uppdatera utmaning" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { challengeId } = await context.params;
    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
      select: { id: true, challengedId: true, challengerId: true },
    });

    if (!challenge) {
      return NextResponse.json({ error: "Utmaningen hittades inte" }, { status: 404 });
    }

    const isParticipant = challenge.challengerId === session.user.id || challenge.challengedId === session.user.id;
    if (!isParticipant) {
      return NextResponse.json({ error: "Endast deltagare kan ta bort utmaningen" }, { status: 403 });
    }

    await prisma.$transaction([
      prisma.habit.deleteMany({ where: { challengeId } }),
      prisma.challenge.delete({ where: { id: challengeId } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Kunde inte ta bort utmaning" }, { status: 500 });
  }
}
