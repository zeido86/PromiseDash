-- AlterTable
ALTER TABLE "Habit" ADD COLUMN     "milestoneStep" DOUBLE PRECISION,
ADD COLUMN     "milestonesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "startValue" DOUBLE PRECISION;
