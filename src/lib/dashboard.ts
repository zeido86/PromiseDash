import {
  addDays,
  eachDayOfInterval,
  addWeeks,
  endOfWeek,
  format,
  isSameDay,
  differenceInCalendarDays,
  startOfToday,
  startOfWeek,
} from "date-fns";

import { isEntryCompleted } from "@/lib/habit-evaluation";
import { prisma } from "@/lib/prisma";

export async function getDashboardData(userId: string) {
  const today = startOfToday();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });

  const expiredChallenges = await prisma.challenge.findMany({
    where: {
      status: "ACCEPTED",
      endDate: { lt: today },
    },
    select: { id: true },
  });

  if (expiredChallenges.length > 0) {
    const expiredIds = expiredChallenges.map((item) => item.id);
    await prisma.$transaction([
      prisma.challenge.updateMany({
        where: { id: { in: expiredIds } },
        data: { status: "EXPIRED" },
      }),
      prisma.habit.updateMany({
        where: { challengeId: { in: expiredIds }, status: "ACTIVE" },
        data: { status: "COMPLETED" },
      }),
    ]);
  }

  const [habits, habitEntries, allEntries, chartEntries] = await Promise.all([
    prisma.habit.findMany({
      where: { userId, status: "ACTIVE" },
      include: {
        category: true,
        challenge: {
          select: {
            id: true,
            status: true,
            challengerId: true,
            challengedId: true,
            endDate: true,
            challenger: { select: { username: true } },
            challenged: { select: { username: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.habitEntry.findMany({
      where: { userId, date: { gte: weekStart, lte: weekEnd } },
    }),
    prisma.habitEntry.findMany({
      where: { userId },
    }),
    prisma.habitEntry.findMany({
      where: { userId },
      orderBy: { date: "asc" },
    }),
  ]);
  const [incomingChallenges, outgoingChallenges, acceptedIncomingChallenges, acceptedOutgoingChallenges] = await Promise.all([
    prisma.challenge.findMany({
      where: { challengedId: userId, status: "PENDING" },
      select: {
        id: true,
        status: true,
        createdAt: true,
        endDate: true,
        habitTitle: true,
        message: true,
        challenger: {
          select: {
            id: true,
            username: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.challenge.findMany({
      where: { challengerId: userId, status: "PENDING" },
      select: {
        id: true,
        status: true,
        createdAt: true,
        endDate: true,
        habitTitle: true,
        message: true,
        challenged: {
          select: {
            id: true,
            username: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.challenge.findMany({
      where: { challengedId: userId, status: "ACCEPTED", endDate: { gte: today } },
      select: {
        id: true,
        status: true,
        createdAt: true,
        endDate: true,
        habitTitle: true,
        message: true,
        challenger: {
          select: {
            id: true,
            username: true,
            name: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    prisma.challenge.findMany({
      where: { challengerId: userId, status: "ACCEPTED", endDate: { gte: today } },
      select: {
        id: true,
        status: true,
        createdAt: true,
        endDate: true,
        habitTitle: true,
        message: true,
        challenged: {
          select: {
            id: true,
            username: true,
            name: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
  ]);
  const bankCarryoverByHabit = habits
    .filter((habit) => habit.templateType === "BANK" && habit.targetValue != null)
    .reduce<Record<string, number>>((acc, habit) => {
      const carry = allEntries
        .filter((entry) => entry.habitId === habit.id && entry.numericValue != null && entry.date < today)
        .reduce((sum, entry) => sum + ((habit.targetValue as number) - (entry.numericValue as number)), 0);
      acc[habit.id] = Number(carry.toFixed(0));
      return acc;
    }, {});

  const todayEntries = habitEntries.filter((entry) => isSameDay(entry.date, today));
  const completedToday = todayEntries.filter((entry) => {
    const habit = habits.find((item) => item.id === entry.habitId);
    return habit ? isEntryCompleted(habit, entry) : false;
  }).length;
  const weekDone = habitEntries.filter((entry) => {
    const habit = habits.find((item) => item.id === entry.habitId);
    return habit ? isEntryCompleted(habit, entry) : false;
  }).length;
  const totalPossibleThisWeek = habits.length * 7;
  const weekProgress = totalPossibleThisWeek > 0 ? Math.round((weekDone / totalPossibleThisWeek) * 100) : 0;

  const numericHabits = habits.filter((habit) => habit.trackingType === "NUMERIC");
  const habitCharts = numericHabits
    .map((habit) => {
      const basePoints = chartEntries
        .filter((entry) => entry.habitId === habit.id && entry.numericValue != null)
        .map((entry) => ({
          date: format(entry.date, "d MMM"),
          isoDate: format(entry.date, "yyyy-MM-dd"),
          value: entry.numericValue as number,
        }));

      let points = basePoints;
      const latestValue: number | null = basePoints.at(-1)?.value ?? null;
      let expectedToday: number | null = null;
      let absoluteDiff: number | null = null;
      let percentDiff: number | null = null;
      let nextMilestone: number | null = null;
      let nextMilestoneDate: string | null = null;
      let aheadOfPace: boolean | null = null;

      if (habit.startValue != null && habit.targetValue != null && habit.endDate) {
        const totalDays = Math.max(differenceInCalendarDays(habit.endDate, habit.startDate), 1);
        const dailyStep = (habit.targetValue - habit.startValue) / totalDays;
        const intervalDays = eachDayOfInterval({
          start: habit.startDate,
          end: today < habit.endDate ? today : habit.endDate,
        });

        const expectedByDate = new Map<string, number>();
        intervalDays.forEach((date, index) => {
          expectedByDate.set(format(date, "yyyy-MM-dd"), Number((habit.startValue! + dailyStep * index).toFixed(2)));
        });

        points = basePoints.map((point) => ({
          ...point,
          pace: expectedByDate.get(point.isoDate) ?? null,
        }));

        const todayKey = format(today, "yyyy-MM-dd");
        expectedToday = expectedByDate.get(todayKey) ?? null;
        if (latestValue != null && expectedToday != null) {
          const direction = habit.targetValue >= habit.startValue ? 1 : -1;
          aheadOfPace = direction > 0 ? latestValue >= expectedToday : latestValue <= expectedToday;
        }

        if (latestValue != null) {
          absoluteDiff = Number((habit.targetValue - latestValue).toFixed(2));
          percentDiff =
            habit.startValue !== 0
              ? Number((((latestValue - habit.startValue) / Math.abs(habit.startValue)) * 100).toFixed(1))
              : null;
        }

        if (habit.milestonesEnabled && latestValue != null) {
          const tomorrow = addDays(today, 1);
          let nextDate = tomorrow;
          if (habit.frequencyType === "WEEKDAYS" && habit.weekdays.length > 0) {
            let cursor = tomorrow;
            for (let i = 0; i < 14; i += 1) {
              if (habit.weekdays.includes(cursor.getDay())) {
                nextDate = cursor;
                break;
              }
              cursor = addDays(cursor, 1);
            }
          } else if (habit.frequencyType === "WEEKLY") {
            nextDate = addWeeks(today, 1);
          }

          const clampedNextDate = habit.endDate && nextDate > habit.endDate ? habit.endDate : nextDate;
          const daysFromStart = Math.max(differenceInCalendarDays(clampedNextDate, habit.startDate), 0);
          const projected = habit.startValue + dailyStep * daysFromStart;
          const bounded =
            habit.targetValue >= habit.startValue
              ? Math.min(projected, habit.targetValue)
              : Math.max(projected, habit.targetValue);
          nextMilestone = Number(bounded.toFixed(2));
          nextMilestoneDate = format(clampedNextDate, "yyyy-MM-dd");
        }
      }

      return {
        habitId: habit.id,
        title: habit.title,
        metricLabel: habit.metricLabel ?? "Varde",
        startValue: habit.startValue,
        targetValue: habit.targetValue,
        endDate: habit.endDate ? format(habit.endDate, "yyyy-MM-dd") : null,
        latestValue,
        expectedToday,
        absoluteDiff,
        percentDiff,
        nextMilestone,
        nextMilestoneDate,
        aheadOfPace,
        points,
      };
    })
    .filter((chart) => chart.points.length > 0);

  const days = Array.from({ length: 7 }).map((_, idx) => addDays(weekStart, idx));
  const weekGrid = habits.map((habit) => {
    const habitWeekEntries = habitEntries.filter((entry) => entry.habitId === habit.id);
    const habitWeekDoneCount = habitWeekEntries.filter((entry) => isEntryCompleted(habit, entry)).length;
    const weeklyTargetReached =
      habit.frequencyType === "WEEKLY_TARGET" &&
      habit.weeklyTarget != null &&
      habitWeekDoneCount >= habit.weeklyTarget;

    const cells = days.map((date) => {
      const entry = habitEntries.find((row) => row.habitId === habit.id && isSameDay(row.date, date));
      const baseDone =
        habit.trackingType === "NUMERIC"
          ? !!entry && entry.numericValue != null
          : isEntryCompleted(habit, entry);
      const done = baseDone;
      let isScheduledDay =
        habit.scheduleMode === "FIXED" && habit.weekdays.length > 0
          ? habit.weekdays.includes(date.getDay())
          : true;

      if (weeklyTargetReached && !done) {
        isScheduledDay = false;
      }

      return {
        date: format(date, "EEE"),
        done,
        failed: !!entry && !done,
        scheduled: isScheduledDay,
        value: entry?.numericValue ?? null,
      };
    });
    return {
      habitId: habit.id,
      title: habit.title,
      challengeId: habit.challengeId,
      challengeStatus: habit.challenge?.status ?? null,
      challengeLabel:
        habit.challenge == null
          ? null
          : habit.challenge.challengerId === userId
            ? `Utmaning mot @${habit.challenge.challenged.username ?? "okänd"} till ${format(habit.challenge.endDate, "yyyy-MM-dd")}`
            : `Utmaning från @${habit.challenge.challenger.username ?? "okänd"} till ${format(habit.challenge.endDate, "yyyy-MM-dd")}`,
      templateType: habit.templateType,
      frequencyType: habit.frequencyType,
      weeklyTarget: habit.weeklyTarget,
      metricLabel: habit.metricLabel,
      targetValue: habit.targetValue,
      goalComparator: habit.goalComparator,
      cells,
    };
  });

  const pendingCards = habits.flatMap((habit) => {
    const endDate = habit.endDate && habit.endDate < today ? habit.endDate : today;
    const intervalStart = habit.startDate <= endDate ? habit.startDate : endDate;
    const daysInRange = eachDayOfInterval({ start: intervalStart, end: endDate });

    return daysInRange
      .filter((date) => {
        const inFuture = date > today;
        if (inFuture) return false;
        // Idag hanteras under "Dagens registrering", inte som retroaktiv eftersläpning.
        if (isSameDay(date, today)) return false;

        if (habit.scheduleMode === "FIXED" && habit.weekdays.length > 0 && !habit.weekdays.includes(date.getDay())) {
          return false;
        }

        if (habit.frequencyType === "WEEKLY" && date.getDay() !== habit.startDate.getDay()) {
          return false;
        }

        const hasEntry = allEntries.some((entry) => entry.habitId === habit.id && isSameDay(entry.date, date));
        return !hasEntry;
      })
      .slice(-7)
      .map((date) => ({
        habitId: habit.id,
        title: habit.title,
        challengeId: habit.challengeId,
        challengeLabel:
          habit.challenge == null
            ? null
            : habit.challenge.challengerId === userId
              ? `Utmaning mot @${habit.challenge.challenged.username ?? "okänd"} till ${format(habit.challenge.endDate, "yyyy-MM-dd")}`
              : `Utmaning från @${habit.challenge.challenger.username ?? "okänd"} till ${format(habit.challenge.endDate, "yyyy-MM-dd")}`,
        templateType: habit.templateType,
        trackingType: habit.trackingType,
        metricLabel: habit.metricLabel,
        date: format(date, "yyyy-MM-dd"),
        dateLabel: format(date, "yyyy-MM-dd"),
      }));
  });

  const habitsForClient = habits.map((habit) => ({
    id: habit.id,
    title: habit.title,
    challengeId: habit.challengeId,
    challengeStatus: habit.challenge?.status ?? null,
    challengeLabel:
      habit.challenge == null
        ? null
        : habit.challenge.challengerId === userId
          ? `Utmaning mot @${habit.challenge.challenged.username ?? "okänd"} till ${format(habit.challenge.endDate, "yyyy-MM-dd")}`
          : `Utmaning från @${habit.challenge.challenger.username ?? "okänd"} till ${format(habit.challenge.endDate, "yyyy-MM-dd")}`,
    templateType: habit.templateType,
    trackingType: habit.trackingType,
    metricLabel: habit.metricLabel,
    startValue: habit.startValue,
    targetValue: habit.targetValue,
    goalComparator: habit.goalComparator ?? null,
    startDate: format(habit.startDate, "yyyy-MM-dd"),
    endDate: habit.endDate ? format(habit.endDate, "yyyy-MM-dd") : null,
    endDateLocked: Boolean(habit.challengeId),
  }));

  return {
    habits: habitsForClient,
    today,
    summary: {
      completedToday,
      totalToday: habits.length,
      weekDone,
      weekProgress,
      activeHabits: habits.length,
    },
    bankCarryoverByHabit,
    challenges: {
      incoming: incomingChallenges.map((item) => ({
        id: item.id,
        status: item.status,
        createdAt: format(item.createdAt, "yyyy-MM-dd"),
        endDate: format(item.endDate, "yyyy-MM-dd"),
        habitTitle: item.habitTitle,
        message: item.message,
        user: item.challenger,
      })),
      outgoing: outgoingChallenges.map((item) => ({
        id: item.id,
        status: item.status,
        createdAt: format(item.createdAt, "yyyy-MM-dd"),
        endDate: format(item.endDate, "yyyy-MM-dd"),
        habitTitle: item.habitTitle,
        message: item.message,
        user: item.challenged,
      })),
      activeMatches: [
        ...acceptedIncomingChallenges.map((item) => ({
          id: item.id,
          role: "challenged" as const,
          status: item.status,
          createdAt: format(item.createdAt, "yyyy-MM-dd"),
          endDate: format(item.endDate, "yyyy-MM-dd"),
          habitTitle: item.habitTitle,
          message: item.message,
          user: item.challenger,
        })),
        ...acceptedOutgoingChallenges.map((item) => ({
          id: item.id,
          role: "challenger" as const,
          status: item.status,
          createdAt: format(item.createdAt, "yyyy-MM-dd"),
          endDate: format(item.endDate, "yyyy-MM-dd"),
          habitTitle: item.habitTitle,
          message: item.message,
          user: item.challenged,
        })),
      ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    },
    habitCharts,
    pendingCards,
    weekGrid,
  };
}
