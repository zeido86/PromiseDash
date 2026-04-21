import { z } from "zod";

export const registerSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_]+$/, "Användarnamn får bara innehålla bokstäver, siffror och _"),
  name: z.string().min(2).max(80),
  email: z.email(),
  password: z.string().min(8).max(128),
});

export const updateHabitSchema = z
  .object({
    targetValue: z.number().positive().optional(),
    goalComparator: z.enum(["GTE", "LTE", "EQ"]).optional(),
    /** `null` tar bort slutdatum (öppet löfte). */
    endDate: z.union([z.string().min(1), z.null()]).optional(),
  })
  .refine(
    (value) =>
      value.targetValue !== undefined || value.goalComparator !== undefined || value.endDate !== undefined,
    { message: "Inget att uppdatera" },
  );

export const createHabitSchema = z
  .object({
    title: z.string().min(2).max(120),
    templateType: z.enum(["STANDARD", "GRAPH", "BANK"]).default("STANDARD"),
    description: z.string().max(400).optional(),
    category: z.string().min(2).max(80).optional(),
    trackingType: z.enum(["BOOLEAN", "NUMERIC"]),
    metricLabel: z.string().max(40).optional(),
    goalLabel: z.string().max(40).optional(),
    goalComparator: z.enum(["GTE", "LTE", "EQ"]).optional(),
    frequencyType: z.enum(["DAILY", "WEEKDAYS", "WEEKLY_TARGET", "WEEKLY"]),
    weeklyTarget: z.number().int().positive().optional(),
    scheduleMode: z.enum(["FIXED", "FLEXIBLE"]).optional(),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    startValue: z.number().optional(),
    targetValue: z.number().positive().optional(),
    milestonesEnabled: z.boolean().optional(),
    unit: z.string().max(20).optional(),
    startDate: z.string(),
    endDate: z.string().optional(),
    setupWeightProfile: z
      .object({
        startWeight: z.number().positive(),
        weighInWeekday: z.number().int().min(0).max(6).optional(),
      })
      .optional(),
    setupCalorieProfile: z
      .object({
        dailyTarget: z.number().int().positive(),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.trackingType === "NUMERIC" && !value.metricLabel) {
      ctx.addIssue({
        code: "custom",
        message: "Ange namn for det numeriska vardet, t.ex. Distans",
        path: ["metricLabel"],
      });
    }

    if (value.targetValue && !value.goalComparator) {
      ctx.addIssue({
        code: "custom",
        message: "Valj jamforelse for malet",
        path: ["goalComparator"],
      });
    }

    if (value.scheduleMode === "FIXED" && (!value.weekdays || value.weekdays.length === 0)) {
      ctx.addIssue({
        code: "custom",
        message: "Valj minst en fast veckodag",
        path: ["weekdays"],
      });
    }

    if (value.endDate && new Date(value.endDate) < new Date(value.startDate)) {
      ctx.addIssue({
        code: "custom",
        message: "Slutdatum får inte vara före startdatum",
        path: ["endDate"],
      });
    }
  });

export const createHabitEntrySchema = z.object({
  habitId: z.string().cuid(),
  date: z.string(),
  checked: z.boolean().optional(),
  numericValue: z.number().nullable().optional(),
  note: z.string().max(400).optional(),
});

export const createWeightEntrySchema = z.object({
  date: z.string(),
  weight: z.number().positive(),
  startWeight: z.number().positive().optional(),
  weighInWeekday: z.number().int().min(0).max(6).optional(),
});

export const createCalorieEntrySchema = z.object({
  date: z.string(),
  intake: z.number().int().nonnegative(),
  burn: z.number().int().nonnegative().default(0),
  dailyTarget: z.number().int().positive().optional(),
});
