-- CreateEnum
CREATE TYPE "GoalComparator" AS ENUM ('GTE', 'LTE', 'EQ');

-- CreateEnum
CREATE TYPE "HabitScheduleMode" AS ENUM ('FIXED', 'FLEXIBLE');

-- AlterTable
ALTER TABLE "Habit" ADD COLUMN     "goalComparator" "GoalComparator",
ADD COLUMN     "goalLabel" TEXT,
ADD COLUMN     "metricLabel" TEXT,
ADD COLUMN     "scheduleMode" "HabitScheduleMode" NOT NULL DEFAULT 'FLEXIBLE';
