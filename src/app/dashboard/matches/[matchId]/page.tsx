import { endOfWeek, format, startOfWeek } from "date-fns";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { authOptions } from "@/lib/auth";
import { isEntryCompleted } from "@/lib/habit-evaluation";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

type RouteContext = { params: Promise<{ matchId: string }> };

async function getChallengeStats(userId: string, challengeId: string, weekStart: Date, weekEnd: Date) {
  const challengeHabit = await prisma.habit.findFirst({
    where: { userId, challengeId, status: "ACTIVE" },
    select: {
      id: true,
      title: true,
      trackingType: true,
      targetValue: true,
      goalComparator: true,
    },
  });

  if (!challengeHabit) {
    return {
      title: "Utmaningslöfte",
      completedThisWeek: 0,
      progress: 0,
    };
  }

  const entries = await prisma.habitEntry.findMany({
    where: {
      userId,
      habitId: challengeHabit.id,
      date: { gte: weekStart, lte: weekEnd },
    },
    select: {
      checked: true,
      numericValue: true,
    },
  });

  const completedThisWeek = entries.filter((entry) => isEntryCompleted(challengeHabit, entry)).length;
  const totalPossible = 7;
  const progress = totalPossible > 0 ? Math.round((completedThisWeek / totalPossible) * 100) : 0;

  return {
    title: challengeHabit.title,
    completedThisWeek,
    progress,
  };
}

export default async function MatchPage(context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/");
  }

  const { matchId } = await context.params;
  const challenge = await prisma.challenge.findUnique({
    where: { id: matchId },
    include: {
      challenger: { select: { id: true, username: true, name: true } },
      challenged: { select: { id: true, username: true, name: true } },
    },
  });

  if (!challenge) {
    redirect("/dashboard");
  }

  const isParticipant = challenge.challengerId === session.user.id || challenge.challengedId === session.user.id;
  if (!isParticipant || (challenge.status !== "ACCEPTED" && challenge.status !== "EXPIRED")) {
    redirect("/dashboard");
  }

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
  const [challengerStats, challengedStats] = await Promise.all([
    getChallengeStats(challenge.challengerId, challenge.id, weekStart, weekEnd),
    getChallengeStats(challenge.challengedId, challenge.id, weekStart, weekEnd),
  ]);

  const yourSide = challenge.challengerId === session.user.id ? "challenger" : "challenged";
  const yourStats = yourSide === "challenger" ? challengerStats : challengedStats;
  const opponentStats = yourSide === "challenger" ? challengedStats : challengerStats;
  const opponentUser = yourSide === "challenger" ? challenge.challenged : challenge.challenger;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 md:px-8">
      <section className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Match</p>
          <h1 className="text-3xl font-bold tracking-tight">
            Du vs @{opponentUser.username ?? "okänd"}
          </h1>
          <p className="text-sm text-muted-foreground">Löfte: {challenge.habitTitle}</p>
          <p className="text-sm text-muted-foreground">
            Startad {format(challenge.createdAt, "yyyy-MM-dd")}
          </p>
          <p className="text-sm text-muted-foreground">
            Slutar {format(challenge.endDate, "yyyy-MM-dd")}
          </p>
          {challenge.message ? (
            <p className="mt-2 text-sm text-muted-foreground">Meddelande: {challenge.message}</p>
          ) : null}
        </div>
        <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }))}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Tillbaka
        </Link>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Din vecka</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-3xl font-semibold">{yourStats.progress}%</p>
            <Progress value={yourStats.progress} />
            <p className="text-sm text-muted-foreground">
              {yourStats.completedThisWeek} av 7 möjliga registreringar
            </p>
            <p className="text-sm text-muted-foreground">Löfte: {yourStats.title}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Motståndaren</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-3xl font-semibold">{opponentStats.progress}%</p>
            <Progress value={opponentStats.progress} />
            <p className="text-sm text-muted-foreground">
              {opponentStats.completedThisWeek} av 7 möjliga registreringar
            </p>
            <p className="text-sm text-muted-foreground">Löfte: {opponentStats.title}</p>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
