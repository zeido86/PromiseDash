-- CreateEnum
CREATE TYPE "HabitTemplateType" AS ENUM ('STANDARD', 'GRAPH', 'BANK');

-- AlterTable
ALTER TABLE "Habit" ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "templateType" "HabitTemplateType" NOT NULL DEFAULT 'STANDARD';
