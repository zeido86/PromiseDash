import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { startOfDay, subDays } from "date-fns";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@promisesdash.local";
  const passwordHash = await hash("Demo12345!", 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      username: "demo_user",
      name: "Demo User",
      passwordHash,
    },
    create: {
      username: "demo_user",
      name: "Demo User",
      email,
      passwordHash,
    },
  });

  const health = await prisma.category.upsert({
    where: { userId_name: { userId: user.id, name: "Halsa" } },
    update: {},
    create: {
      userId: user.id,
      name: "Halsa",
      color: "#22c55e",
    },
  });

  const habits = await Promise.all([
    prisma.habit.upsert({
      where: { id: "cm-demo-habit-1" },
      update: {},
      create: {
        id: "cm-demo-habit-1",
        userId: user.id,
        categoryId: health.id,
        title: "Traena 4 dagar i veckan",
        templateType: "STANDARD",
        trackingType: "BOOLEAN",
        frequencyType: "WEEKLY_TARGET",
        weeklyTarget: 4,
        scheduleMode: "FLEXIBLE",
        startDate: subDays(new Date(), 21),
      },
    }),
    prisma.habit.upsert({
      where: { id: "cm-demo-habit-2" },
      update: {},
      create: {
        id: "cm-demo-habit-2",
        userId: user.id,
        categoryId: health.id,
        title: "Proteinmal varje dag",
        templateType: "GRAPH",
        trackingType: "NUMERIC",
        metricLabel: "Protein",
        goalLabel: "Proteinmal",
        goalComparator: "GTE",
        frequencyType: "DAILY",
        scheduleMode: "FLEXIBLE",
        targetValue: 160,
        unit: "g",
        startDate: subDays(new Date(), 21),
      },
    }),
  ]);

  for (let i = 0; i < 14; i += 1) {
    const date = startOfDay(subDays(new Date(), 13 - i));

    await prisma.habitEntry.upsert({
      where: { habitId_date: { habitId: habits[0].id, date } },
      update: { checked: i % 2 === 0 },
      create: {
        habitId: habits[0].id,
        userId: user.id,
        date,
        checked: i % 2 === 0,
      },
    });

    await prisma.habitEntry.upsert({
      where: { habitId_date: { habitId: habits[1].id, date } },
      update: { numericValue: 130 + (i % 5) * 10 },
      create: {
        habitId: habits[1].id,
        userId: user.id,
        date,
        numericValue: 130 + (i % 5) * 10,
      },
    });
  }

  await prisma.weightProfile.upsert({
    where: { userId: user.id },
    update: { startWeight: 92.5, weighInWeekday: 5 },
    create: { userId: user.id, startWeight: 92.5, weighInWeekday: 5 },
  });

  for (let i = 0; i < 8; i += 1) {
    const date = startOfDay(subDays(new Date(), (7 - i) * 7));
    await prisma.weightEntry.upsert({
      where: { userId_date: { userId: user.id, date } },
      update: { weight: 92.5 - i * 0.4 },
      create: {
        userId: user.id,
        date,
        weight: 92.5 - i * 0.4,
      },
    });
  }

  await prisma.calorieProfile.upsert({
    where: { userId: user.id },
    update: { dailyTarget: 2200 },
    create: { userId: user.id, dailyTarget: 2200 },
  });

  let runningBalance = 0;
  for (let i = 0; i < 21; i += 1) {
    const date = startOfDay(subDays(new Date(), 20 - i));
    const intake = 2050 + (i % 6) * 80;
    const burn = i % 3 === 0 ? 250 : 120;
    const net = intake - burn;
    const dailyDelta = 2200 - net;
    runningBalance += dailyDelta;

    await prisma.calorieEntry.upsert({
      where: { userId_date: { userId: user.id, date } },
      update: { intake, burn },
      create: { userId: user.id, date, intake, burn },
    });

    await prisma.calorieBalance.upsert({
      where: { userId_date: { userId: user.id, date } },
      update: { dailyDelta, runningBalance },
      create: { userId: user.id, date, dailyDelta, runningBalance },
    });
  }

  console.log("Seed klar.");
  console.log("Demo login: demo@promisesdash.local / Demo12345!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
