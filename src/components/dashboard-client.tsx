"use client";

import { format } from "date-fns";
import { Check, X } from "lucide-react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type HabitTemplateType = "STANDARD" | "GRAPH" | "BANK" | "COUNTDOWN";
type Habit = {
  id: string;
  title: string;
  challengeId?: string | null;
  challengeStatus?: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPIRED" | null;
  challengeLabel?: string | null;
  templateType: HabitTemplateType;
  trackingType: "BOOLEAN" | "NUMERIC";
  metricLabel?: string | null;
  startValue?: number | null;
  targetValue?: number | null;
  goalComparator?: "GTE" | "LTE" | "EQ" | null;
  startDate: string;
  endDate: string | null;
  endDateLocked: boolean;
};

type DashboardData = {
  habits: Habit[];
  summary: {
    completedToday: number;
    totalToday: number;
    weekDone: number;
    weekProgress: number;
    activeHabits: number;
  };
  bankCarryoverByHabit: Record<string, number>;
  challenges: {
    incoming: Array<{
      id: string;
      status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPIRED";
      createdAt: string;
      endDate: string;
      habitTitle: string;
      message: string | null;
      user: { id: string; username: string | null; name: string | null };
    }>;
    outgoing: Array<{
      id: string;
      status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPIRED";
      createdAt: string;
      endDate: string;
      habitTitle: string;
      message: string | null;
      user: { id: string; username: string | null; name: string | null };
    }>;
    activeMatches: Array<{
      id: string;
      role: "challenger" | "challenged";
      status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPIRED";
      createdAt: string;
      endDate: string;
      habitTitle: string;
      message: string | null;
      user: { id: string; username: string | null; name: string | null };
    }>;
  };
  habitCharts: Array<{
    habitId: string;
    title: string;
    metricLabel: string;
    startValue?: number | null;
    targetValue?: number | null;
    endDate?: string | null;
    latestValue?: number | null;
    expectedToday?: number | null;
    absoluteDiff?: number | null;
    percentDiff?: number | null;
    nextMilestone?: number | null;
    nextMilestoneDate?: string | null;
    aheadOfPace?: boolean | null;
    points: Array<{ date: string; isoDate?: string; value: number; pace?: number | null }>;
  }>;
  countdownCards: Array<{
    habitId: string;
    title: string;
    targetDate: string | null;
  }>;
  pendingCards: Array<{
    habitId: string;
    title: string;
    challengeId?: string | null;
    challengeLabel?: string | null;
    templateType: HabitTemplateType;
    trackingType: "BOOLEAN" | "NUMERIC";
    metricLabel?: string | null;
    date: string;
    dateLabel: string;
  }>;
  weekGrid: Array<{
    habitId: string;
    title: string;
    challengeId?: string | null;
    challengeLabel?: string | null;
    templateType: HabitTemplateType;
    frequencyType: "DAILY" | "WEEKDAYS" | "WEEKLY_TARGET" | "WEEKLY";
    weeklyTarget?: number | null;
    metricLabel?: string | null;
    targetValue?: number | null;
    goalComparator?: "GTE" | "LTE" | "EQ" | null;
    cells: Array<{ date: string; done: boolean; failed: boolean; scheduled: boolean; value: number | null }>;
  }>;
};

const weekdayOptions = [
  { label: "Mån", value: 1 },
  { label: "Tis", value: 2 },
  { label: "Ons", value: 3 },
  { label: "Tor", value: 4 },
  { label: "Fre", value: 5 },
  { label: "Lör", value: 6 },
  { label: "Sön", value: 0 },
];
const hourOptions = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
const minuteOptions = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, "0"));
const weekdayNamesFull = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];

type EntryState = Record<string, { numericValue: string; checked?: boolean }>;

export function DashboardClient({ data }: { data: DashboardData }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showCreateHabit, setShowCreateHabit] = useState(false);
  const [showChallengeCard, setShowChallengeCard] = useState(false);

  const [habitForm, setHabitForm] = useState({
    templateType: "STANDARD" as HabitTemplateType,
    title: "",
    trackingType: "" as "" | "BOOLEAN" | "NUMERIC",
    metricLabel: "",
    startValue: "",
    goalLabel: "Målvärde",
    targetValue: "",
    goalComparator: "GTE" as "GTE" | "LTE" | "EQ",
    frequencyType: "" as "" | "DAILY" | "WEEKDAYS" | "WEEKLY_TARGET",
    weeklyTarget: "",
    scheduleMode: "FLEXIBLE" as "FIXED" | "FLEXIBLE",
    weekdays: [] as number[],
    startDate: "",
    endDate: "",
    countdownTargetDate: "",
    countdownTargetTime: "",
    startWeight: "",
    weighInWeekday: "5",
    milestonesEnabled: false,
  });
  const [entryState, setEntryState] = useState<EntryState>({});
  const [chartReplayKey, setChartReplayKey] = useState<Record<string, number>>({});
  const [challengeQuery, setChallengeQuery] = useState("");
  const [challengeHabitTitle, setChallengeHabitTitle] = useState("Daglig utmaning");
  const [challengeTrackingType, setChallengeTrackingType] = useState<"BOOLEAN" | "NUMERIC">("BOOLEAN");
  const [challengeMetricLabel, setChallengeMetricLabel] = useState("Värde");
  const [challengeTargetValue, setChallengeTargetValue] = useState("");
  const [challengeGoalComparator, setChallengeGoalComparator] = useState<"GTE" | "LTE" | "EQ">("GTE");
  const [challengeEndDate, setChallengeEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [challengeMessage, setChallengeMessage] = useState("");
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [challengeCandidates, setChallengeCandidates] = useState<
    Array<{ id: string; username: string | null; name: string | null }>
  >([]);
  const [habitSettingsOpenId, setHabitSettingsOpenId] = useState<string | null>(null);
  const [habitSettingsDraft, setHabitSettingsDraft] = useState({
    endDate: "",
    targetValue: "",
    goalComparator: "GTE" as "GTE" | "LTE" | "EQ",
  });
  const [countdownNow, setCountdownNow] = useState(new Date());

  function parseNumeric(value: string): number | undefined {
    if (!value.trim()) return undefined;
    const normalized = value.replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  useEffect(() => {
    const timer = window.setInterval(() => setCountdownNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  function formatCountdown(targetDate: string | null) {
    if (!targetDate) return "Saknar slutdatum";
    const target = new Date(targetDate);
    const diffMs = target.getTime() - countdownNow.getTime();
    if (diffMs <= 0) return "Tiden är ute";

    const totalSeconds = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  }

  function getCountdownFact(targetDate: string | null, habitId: string) {
    if (!targetDate) return null;
    const remainingMinutes = Math.floor((new Date(targetDate).getTime() - countdownNow.getTime()) / 60000);
    if (remainingMinutes <= 0) return "Tiden är ute - dags att fira eller starta nästa nedräkning.";

    const minuteBucket = Math.floor(countdownNow.getTime() / 60000);
    const habitHash = habitId.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const facts = [
      { unit: 9, label: "spaghetti-kok (9 min per omgång)" },
      { unit: 25, label: "Pomodoro-pass (25 min)" },
      { unit: 40, label: "Lost-avsnitt (40 min)" },
      { unit: 14 * 40, label: "Lost-säsonger (14 avsnitt x 40 min)" },
      { unit: 22, label: "sitcom-avsnitt (22 min)" },
      { unit: 45, label: "dramaavsnitt (45 min)" },
      { unit: 90, label: "långfilmer (90 min)" },
      { unit: 120, label: "filmer på 2 timmar" },
      { unit: 30, label: "tvättprogram (30 min)" },
      { unit: 60, label: "tvättprogram (60 min)" },
      { unit: 75, label: "diskmaskinsprogram (75 min)" },
      { unit: 180, label: "surdegsmatning var 3:e timme" },
      { unit: 8, label: "kaffepauser (8 min)" },
      { unit: 5, label: "mikropauser (5 min)" },
      { unit: 12, label: "äggkokningar (12 min för hårdkokt)" },
      { unit: 15, label: "snabba stretchpass (15 min)" },
      { unit: 20, label: "meditationer (20 min)" },
      { unit: 35, label: "hemmaträningspass (35 min)" },
      { unit: 50, label: "fokustimmar i skolan/jobb (50 min)" },
      { unit: 70, label: "pendlingar enkel resa (70 min)" },
      { unit: 240, label: "jobbpass på 4 timmar" },
      { unit: 480, label: "arbetsdagar på 8 timmar" },
      { unit: 1440, label: "hela dygn" },
      { unit: 7 * 1440, label: "hela veckor" },
      { unit: 10, label: "duolingo-pass (10 min)" },
      { unit: 3, label: "låtar på cirka 3 minuter" },
      { unit: 4, label: "låtar på cirka 4 minuter" },
      { unit: 55, label: "podcastavsnitt (55 min)" },
      { unit: 65, label: "brödjäsningar (65 min)" },
      { unit: 95, label: "matlådelagningar (95 min)" },
      { unit: 6, label: "tebryggningar med vila (6 min)" },
      { unit: 11, label: "snabbduschar med fix (11 min)" },
      { unit: 28, label: "snabbstädpass (28 min)" },
      { unit: 32, label: "språklektioner (32 min)" },
      { unit: 42, label: "fysikpass i skolan (42 min)" },
      { unit: 52, label: "klassiska kontorsmöten (52 min)" },
      { unit: 58, label: "bake-off avsnittslängder (58 min)" },
      { unit: 68, label: "fotbollsmatcher utan paus (68 min effektiv tid)" },
      { unit: 78, label: "träning + dusch (78 min)" },
      { unit: 88, label: "matinköp med resa (88 min)" },
      { unit: 98, label: "film + snackpaus (98 min)" },
      { unit: 108, label: "två avsnitt drama + paus (108 min)" },
      { unit: 118, label: "långpromenader (118 min)" },
      { unit: 128, label: "söndagsstädningar (128 min)" },
      { unit: 138, label: "pluggpass med raster (138 min)" },
      { unit: 148, label: "matprepp mini (148 min)" },
      { unit: 158, label: "co-op spelkvällar (158 min)" },
      { unit: 168, label: "3 timmar gaming minus pauser (168 min)" },
      { unit: 178, label: "bakdagens första etapp (178 min)" },
      { unit: 188, label: "kort roadtrip med stopp (188 min)" },
      { unit: 198, label: "helkväll med serie + fika (198 min)" },
      { unit: 208, label: "veckoplanering + handling (208 min)" },
      { unit: 218, label: "storstädning av ett rum (218 min)" },
      { unit: 228, label: "långkok inklusive prep (228 min)" },
      { unit: 238, label: "brädspelsrunda med upppackning (238 min)" },
      { unit: 248, label: "filmkväll med efterprat (248 min)" },
    ];

    const days = Math.floor(remainingMinutes / 1440);
    const hours = Math.floor((remainingMinutes % 1440) / 60);
    const mins = remainingMinutes % 60;
    const detail = `(${days}d ${hours}h ${mins}m kvar)`;

    const variants = facts.map((fact) => {
      const count = Math.max(1, Math.floor(remainingMinutes / fact.unit));
      return `Lika lång tid som ungefär ${count} st ${fact.label} ${detail}`;
    });

    return variants[(minuteBucket + habitHash) % variants.length];
  }

  const dayIndex = (new Date().getDay() + 6) % 7;
  const doneToday = new Set(
    data.weekGrid.filter((row) => row.cells[dayIndex]?.done).map((row) => row.habitId),
  );
  const weekRowByHabit = new Map(data.weekGrid.map((row) => [row.habitId, row]));
  const reportedToday = new Map<string, boolean | undefined>(
    data.weekGrid.map((row) => {
      const cell = row.cells[dayIndex];
      if (!cell) return [row.habitId, undefined];
      if (cell.done) return [row.habitId, true];
      if (cell.failed) return [row.habitId, false];
      return [row.habitId, undefined];
    }),
  );

  function resetHabitForm(templateType: HabitTemplateType = "STANDARD") {
    setHabitForm({
      templateType,
      title: "",
      trackingType: "",
      metricLabel: "",
      startValue: "",
      goalLabel: "Målvärde",
      targetValue: "",
      goalComparator: "GTE",
      frequencyType: "",
      weeklyTarget: "",
      scheduleMode: "FLEXIBLE",
      weekdays: [],
      startDate: "",
      endDate: "",
      countdownTargetDate: "",
      countdownTargetTime: "",
      startWeight: "",
      weighInWeekday: "5",
      milestonesEnabled: false,
    });
  }

  function applyTemplate(templateType: HabitTemplateType) {
    resetHabitForm(templateType);
  }

  async function run(action: () => Promise<void>, okMessage: string) {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      await action();
      setFeedback((current) => current ?? okMessage);
      router.refresh();
    } catch {
      setFeedback("Något gick fel vid sparning.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function postJson(url: string, body: Record<string, unknown>) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("failed");
    return (await res.json()) as Record<string, unknown>;
  }

  async function searchUsers() {
    const query = challengeQuery.trim();
    if (query.length < 2) {
      setChallengeCandidates([]);
      return;
    }
    setUserSearchLoading(true);
    try {
      const res = await fetch(`/api/users/search?username=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error("failed");
      const payload = (await res.json()) as {
        users: Array<{ id: string; username: string | null; name: string | null }>;
      };
      setChallengeCandidates(payload.users);
    } catch {
      setChallengeCandidates([]);
      setFeedback("Kunde inte söka användare.");
    } finally {
      setUserSearchLoading(false);
    }
  }

  async function sendChallenge(userId: string) {
    await run(async () => {
      const body: Record<string, unknown> = { userId };
      if (challengeHabitTitle.trim()) {
        body.habitTitle = challengeHabitTitle.trim();
      }
      body.trackingType = challengeTrackingType;
      if (challengeTrackingType === "NUMERIC") {
        body.metricLabel = challengeMetricLabel.trim() || "Värde";
        body.goalComparator = challengeGoalComparator;
        const parsedTarget = parseNumeric(challengeTargetValue);
        if (parsedTarget != null) {
          body.targetValue = parsedTarget;
        }
      }
      body.endDate = new Date(`${challengeEndDate}T12:00:00`).toISOString();
      if (challengeMessage.trim()) {
        body.message = challengeMessage.trim();
      }
      await postJson("/api/challenges", body);
      setChallengeMessage("");
    }, "Utmaning skickad.");
  }

  async function respondToChallenge(challengeId: string, status: "ACCEPTED" | "DECLINED") {
    await run(async () => {
      const res = await fetch(`/api/challenges/${challengeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("failed");
    }, status === "ACCEPTED" ? "Utmaning accepterad." : "Utmaning avböjd.");
  }

  async function endChallenge(challengeId: string) {
    await run(async () => {
      const res = await fetch(`/api/challenges/${challengeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      if (!res.ok) throw new Error("failed");
    }, "Utmaningen avslutades.");
  }

  async function removeChallenge(challengeId: string) {
    await run(async () => {
      const res = await fetch(`/api/challenges/${challengeId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed");
    }, "Utmaningen togs bort.");
  }

  function openMatch(matchId: string) {
    router.push(`/dashboard/matches/${matchId}`);
  }

  async function submitHabit() {
    const countdownTargetIso =
      habitForm.countdownTargetDate && habitForm.countdownTargetTime
        ? new Date(`${habitForm.countdownTargetDate}T${habitForm.countdownTargetTime}:00`).toISOString()
        : undefined;

    await run(async () => {
      await postJson("/api/habits", {
        title: habitForm.title,
        templateType: habitForm.templateType,
        trackingType: habitForm.templateType === "COUNTDOWN" ? "BOOLEAN" : habitForm.trackingType,
        metricLabel:
          habitForm.templateType === "COUNTDOWN"
            ? undefined
            : habitForm.trackingType === "NUMERIC"
              ? habitForm.metricLabel
              : undefined,
        startValue:
          habitForm.templateType === "COUNTDOWN"
            ? undefined
            : habitForm.trackingType === "NUMERIC"
              ? parseNumeric(habitForm.startValue)
              : undefined,
        goalLabel:
          habitForm.templateType === "COUNTDOWN"
            ? undefined
            : habitForm.trackingType === "NUMERIC"
            ? habitForm.milestonesEnabled
              ? "Delmål"
              : "Mål"
            : undefined,
        goalComparator:
          habitForm.templateType === "COUNTDOWN"
            ? undefined
            : habitForm.trackingType === "NUMERIC"
              ? habitForm.goalComparator
              : undefined,
        targetValue:
          habitForm.templateType === "COUNTDOWN"
            ? undefined
            : habitForm.trackingType === "NUMERIC"
              ? parseNumeric(habitForm.targetValue)
              : undefined,
        frequencyType:
          habitForm.templateType === "COUNTDOWN" ? "DAILY" : habitForm.frequencyType || "WEEKLY_TARGET",
        scheduleMode:
          habitForm.templateType === "COUNTDOWN"
            ? "FLEXIBLE"
            : habitForm.frequencyType === "WEEKDAYS"
              ? "FIXED"
              : "FLEXIBLE",
        weeklyTarget:
          habitForm.templateType !== "COUNTDOWN" &&
          habitForm.frequencyType === "WEEKLY_TARGET" &&
          habitForm.weeklyTarget
            ? Number(habitForm.weeklyTarget)
            : undefined,
        weekdays:
          habitForm.templateType !== "COUNTDOWN" && habitForm.frequencyType === "WEEKDAYS"
            ? habitForm.weekdays
            : [],
        startDate: new Date(`${habitForm.startDate || format(new Date(), "yyyy-MM-dd")}T12:00:00`).toISOString(),
        endDate:
          habitForm.templateType === "COUNTDOWN"
            ? countdownTargetIso
            : habitForm.endDate
              ? new Date(`${habitForm.endDate}T12:00:00`).toISOString()
              : undefined,
        setupWeightProfile:
          habitForm.templateType === "GRAPH" && habitForm.metricLabel.toLowerCase().includes("vikt") && habitForm.startWeight
            ? { startWeight: Number(habitForm.startWeight), weighInWeekday: Number(habitForm.weighInWeekday) }
            : undefined,
        setupCalorieProfile:
          habitForm.templateType === "BANK" && parseNumeric(habitForm.targetValue)
            ? { dailyTarget: Number(parseNumeric(habitForm.targetValue)) }
            : undefined,
        milestonesEnabled:
          habitForm.templateType === "COUNTDOWN"
            ? false
            : habitForm.milestonesEnabled && !!habitForm.endDate,
      });
    }, "Löftet har skapats.");
  }

  async function saveEntry(
    habit: Habit,
    dateKey = format(new Date(), "yyyy-MM-dd"),
    checkedOverride?: boolean,
  ) {
    const key = `${habit.id}:${dateKey}`;
    const state = entryState[key] ?? { numericValue: "", checked: undefined };
    const requestDate = new Date(`${dateKey}T12:00:00`).toISOString();
    await run(async () => {
      const entryResponse = await postJson("/api/habits/entries", {
        habitId: habit.id,
        date: requestDate,
        checked:
          habit.trackingType === "BOOLEAN"
            ? checkedOverride ?? state.checked ?? !doneToday.has(habit.id)
            : checkedOverride === false
              ? false
              : true,
        numericValue: checkedOverride === false ? null : state.numericValue ? Number(state.numericValue) : undefined,
      });
      const savedDate = typeof entryResponse.date === "string" ? entryResponse.date : requestDate;
      const savedDateLabel = format(new Date(savedDate), "yyyy-MM-dd");
      setFeedback(`Sparat på ${savedDateLabel}.`);
    }, "Registreringen har sparats.");
  }

  async function clearNumericEntry(habit: Habit, key: string, hasSavedNumericValueToday: boolean) {
    if (!hasSavedNumericValueToday) {
      // Only clear local draft when nothing has been persisted for today.
      setEntryState((prev) => ({
        ...prev,
        [key]: { ...(prev[key] ?? { numericValue: "", checked: undefined }), numericValue: "" },
      }));
      return;
    }
    await saveEntry(habit, format(new Date(), "yyyy-MM-dd"), false);
  }

  async function deleteHabit(habitId: string, title: string) {
    await run(async () => {
      const res = await fetch(`/api/habits/${habitId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
    }, `${title} har tagits bort.`);
  }

  function openHabitSettings(habit: Habit) {
    if (habitSettingsOpenId === habit.id) {
      setHabitSettingsOpenId(null);
      return;
    }
    setHabitSettingsOpenId(habit.id);
    setHabitSettingsDraft({
      endDate: habit.endDate ?? "",
      targetValue: habit.targetValue != null ? String(habit.targetValue) : "",
      goalComparator: habit.goalComparator ?? "GTE",
    });
  }

  async function saveHabitSettings(habit: Habit) {
    const body: Record<string, unknown> = {};
    if (!habit.endDateLocked) {
      const trimmed = habitSettingsDraft.endDate.trim();
      const prev = habit.endDate ?? "";
      if (trimmed !== prev) {
        if (!trimmed && habit.endDate) {
          body.endDate = null;
        } else if (trimmed) {
          body.endDate = trimmed;
        }
      }
    }
    if (habit.trackingType === "NUMERIC") {
      const nextTarget = parseNumeric(habitSettingsDraft.targetValue);
      if (nextTarget !== undefined && nextTarget !== habit.targetValue) {
        body.targetValue = nextTarget;
      }
      const prevComp = habit.goalComparator ?? "GTE";
      if (habitSettingsDraft.goalComparator !== prevComp) {
        body.goalComparator = habitSettingsDraft.goalComparator;
      }
    }

    if (Object.keys(body).length === 0) {
      setHabitSettingsOpenId(null);
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/habits/${habit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setFeedback(typeof payload.error === "string" ? payload.error : "Kunde inte spara ändringar.");
        return;
      }
      setFeedback("Ändringar sparade.");
      setHabitSettingsOpenId(null);
      router.refresh();
    } catch {
      setFeedback("Något gick fel vid sparning.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function comparatorText(value: Habit["goalComparator"]) {
    if (value === "LTE") return "<=";
    if (value === "EQ") return "=";
    return ">=";
  }

  function replayChart(habitId: string) {
    setChartReplayKey((prev) => ({
      ...prev,
      [habitId]: (prev[habitId] ?? 0) + 1,
    }));
  }

  function getRegistrationHint(habitId: string) {
    const row = data.weekGrid.find((item) => item.habitId === habitId);
    if (!row) return null;

    const todayIdx = dayIndex;
    const remainingCells = row.cells.slice(todayIdx);
    const daysUntilWeekEnd = row.cells.length - 1 - todayIdx;

    if (row.frequencyType === "WEEKDAYS") {
      const pendingScheduled = remainingCells
        .map((cell, idx) => ({ cell, idx }))
        .filter(({ cell }) => cell.scheduled && !cell.done);

      if (pendingScheduled.length === 0) return null;
      if (pendingScheduled.length === 1) {
        return `Registreras senast om ${pendingScheduled[0].idx} dagar`;
      }
      const lastIdx = pendingScheduled[pendingScheduled.length - 1].idx;
      return `Ska registreras ${pendingScheduled.length} gånger till inom ${lastIdx} dagar`;
    }

    if (row.frequencyType === "WEEKLY_TARGET") {
      const doneThisWeek = row.cells.filter((cell) => cell.done).length;
      const target = row.weeklyTarget ?? 0;
      const remaining = Math.max(target - doneThisWeek, 0);
      if (remaining === 0) return null;
      if (remaining === 1) return `Registreras senast inom ${daysUntilWeekEnd} dagar`;
      return `Ska registreras ${remaining} gånger till inom ${daysUntilWeekEnd} dagar`;
    }

    return null;
  }

  return (
    <div
      className="grid gap-6 [&_[data-slot=card]]:border [&_[data-slot=card]]:border-[#2da2ff33] [&_[data-slot=card]]:bg-[#0a1022]/95 [&_[data-slot=card]]:text-blue-50 [&_[data-slot=card-title]]:text-blue-50 [&_.text-muted-foreground]:text-blue-100/70 [&_[data-slot=button][data-variant=outline]]:border-[#2da2ff55] [&_[data-slot=button][data-variant=outline]]:bg-[#0f1832] [&_[data-slot=button][data-variant=outline]]:text-blue-50 [&_[data-slot=input]]:border-[#2da2ff55] [&_[data-slot=input]]:bg-[#0f1832] [&_[data-slot=input]]:text-blue-50 [&_[data-slot=input]]:placeholder:text-blue-200/40"
    >
      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="text-center"><CardTitle>Dagens löften</CardTitle></CardHeader>
          <CardContent className="text-center text-3xl font-semibold">{data.summary.completedToday}/{data.summary.totalToday}</CardContent>
        </Card>
        <Card>
          <CardHeader className="text-center"><CardTitle>Veckoprogress</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-center">
            <p className="text-3xl font-semibold">{data.summary.weekProgress}%</p>
            <Progress value={data.summary.weekProgress} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="text-center"><CardTitle>Aktiva löften</CardTitle></CardHeader>
          <CardContent className="text-center text-3xl font-semibold">{data.summary.activeHabits}</CardContent>
        </Card>
      </section>

      <section className="flex justify-center">
        <Button
          variant="outline"
          onClick={() =>
            setShowCreateHabit((prev) => {
              const next = !prev;
              if (next) resetHabitForm("STANDARD");
              return next;
            })
          }
        >
          {showCreateHabit ? "Dölj skapa löfte" : "Nytt löfte"}
        </Button>
      </section>

      {showChallengeCard ? (
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Utmana användare</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
              <Input
                placeholder="Sök användarnamn (minst 2 tecken)"
                value={challengeQuery}
                onChange={(e) => setChallengeQuery(e.target.value)}
              />
              <Button variant="outline" onClick={searchUsers} disabled={isSubmitting || userSearchLoading}>
                {userSearchLoading ? "Söker..." : "Sök"}
              </Button>
            </div>
            <Input
              placeholder="Löfte för utmaningen (ex. 10 000 steg)"
              value={challengeHabitTitle}
              onChange={(e) => setChallengeHabitTitle(e.target.value)}
            />
            <Input
              type="date"
              value={challengeEndDate}
              onChange={(e) => setChallengeEndDate(e.target.value)}
            />
            <div className="grid gap-2 md:grid-cols-2">
              <Select
                value={challengeTrackingType}
                onValueChange={(value) => setChallengeTrackingType(value as "BOOLEAN" | "NUMERIC")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Typ av utmaning" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BOOLEAN">Ja/nej</SelectItem>
                  <SelectItem value="NUMERIC">Numerisk</SelectItem>
                </SelectContent>
              </Select>
              {challengeTrackingType === "NUMERIC" ? (
                <Input
                  placeholder="Namn på värde (ex. Steg)"
                  value={challengeMetricLabel}
                  onChange={(e) => setChallengeMetricLabel(e.target.value)}
                />
              ) : (
                <div />
              )}
            </div>
            {challengeTrackingType === "NUMERIC" ? (
              <div className="grid gap-2 md:grid-cols-2">
                <Input
                  placeholder="Målvärde (valfritt)"
                  value={challengeTargetValue}
                  onChange={(e) => setChallengeTargetValue(e.target.value)}
                />
                <Select
                  value={challengeGoalComparator}
                  onValueChange={(value) => setChallengeGoalComparator(value as "GTE" | "LTE" | "EQ")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Målregel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GTE">Lika med eller högre</SelectItem>
                    <SelectItem value="LTE">Lika med eller lägre</SelectItem>
                    <SelectItem value="EQ">Exakt lika</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <Input
              placeholder="Meddelande till utmaningen (valfritt)"
              value={challengeMessage}
              onChange={(e) => setChallengeMessage(e.target.value)}
            />
            {challengeCandidates.length > 0 ? (
              <div className="grid gap-2">
                {challengeCandidates.map((user) => (
                  <div key={user.id} className="flex items-center justify-between rounded-md border p-2">
                    <p className="text-sm">
                      @{user.username}
                      {user.name ? ` · ${user.name}` : ""}
                    </p>
                    <Button size="sm" onClick={() => sendChallenge(user.id)} disabled={isSubmitting}>
                      Skicka utmaning
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium">Mottagna utmaningar</p>
                {data.challenges.incoming.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Inga mottagna utmaningar ännu.</p>
                ) : (
                  data.challenges.incoming.map((challenge) => (
                    <div key={challenge.id} className="rounded-md border p-2">
                      <p className="text-xs text-muted-foreground">
                        @{challenge.user.username ?? "okänd"} · {challenge.createdAt}
                        {` · Löfte: ${challenge.habitTitle} · Slut: ${challenge.endDate}`}
                        {challenge.message ? ` · "${challenge.message}"` : ""}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => respondToChallenge(challenge.id, "ACCEPTED")}
                          disabled={isSubmitting}
                        >
                          Acceptera
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => respondToChallenge(challenge.id, "DECLINED")}
                          disabled={isSubmitting}
                        >
                          Avböj
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Skickade utmaningar</p>
                {data.challenges.outgoing.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Inga skickade utmaningar ännu.</p>
                ) : (
                  data.challenges.outgoing.map((challenge) => (
                    <p key={challenge.id} className="text-xs text-muted-foreground">
                      @{challenge.user.username ?? "okänd"} · {challenge.createdAt}
                      {` · Löfte: ${challenge.habitTitle} · Slut: ${challenge.endDate}`}
                      {challenge.message ? ` · "${challenge.message}"` : ""}
                    </p>
                  ))
                )}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Accepterade utmaningar (aktiva matcher)</p>
              {data.challenges.activeMatches.length === 0 ? (
                <p className="text-xs text-muted-foreground">Inga aktiva matcher ännu.</p>
              ) : (
                data.challenges.activeMatches.map((challenge) => (
                  <div key={challenge.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        @{challenge.user.username ?? "okänd"}
                        {challenge.user.name ? ` · ${challenge.user.name}` : ""}
                      </p>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">Aktiv</Badge>
                        <Badge variant="outline">
                          {challenge.role === "challenger" ? "Du utmanade" : "Utmanade dig"}
                        </Badge>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Startdatum: {challenge.createdAt}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Slutdatum: {challenge.endDate}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Löfte: {challenge.habitTitle}</p>
                    {challenge.message ? (
                      <p className="mt-1 text-xs text-muted-foreground">Meddelande: {challenge.message}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => openMatch(challenge.id)}>
                        Öppna match
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => endChallenge(challenge.id)} disabled={isSubmitting}>
                        Avsluta
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => removeChallenge(challenge.id)} disabled={isSubmitting}>
                        Ta bort
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </section>
      ) : null}

      <section className={`grid gap-6 ${showCreateHabit ? "lg:grid-cols-2" : ""}`}>
        {showCreateHabit ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-center">Skapa nytt löfte</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-blue-100">Typ av löfte</p>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {[
                    { value: "STANDARD", label: "Standard" },
                    { value: "GRAPH", label: "Graf" },
                    { value: "BANK", label: "Bank" },
                    { value: "COUNTDOWN", label: "Nedräkning" },
                  ].map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      className={cn(
                        "transition-all",
                        habitForm.templateType === option.value
                          ? "border-blue-300 bg-blue-500 text-white hover:bg-blue-500/90"
                          : "border-[#2da2ff66] bg-[#0f1832] text-blue-100 hover:bg-[#16264d]",
                      )}
                      variant="outline"
                      onClick={() => applyTemplate(option.value as HabitTemplateType)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-blue-100">Namn</p>
              <Input placeholder="Ex: Spring 5 km" value={habitForm.title} onChange={(e) => setHabitForm((s) => ({ ...s, title: e.target.value }))} />
              </div>
              {habitForm.templateType === "COUNTDOWN" ? (
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-blue-100">Nedräkning till</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    <Input
                      type="date"
                      value={habitForm.countdownTargetDate}
                      onChange={(e) => setHabitForm((s) => ({ ...s, countdownTargetDate: e.target.value }))}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Select
                        value={habitForm.countdownTargetTime.split(":")[0] ?? ""}
                        onValueChange={(hour) =>
                          setHabitForm((s) => {
                            const currentMinute = s.countdownTargetTime.split(":")[1] ?? "00";
                            return { ...s, countdownTargetTime: `${hour}:${currentMinute}` };
                          })
                        }
                      >
                        <SelectTrigger><SelectValue placeholder="Timme" /></SelectTrigger>
                        <SelectContent>
                          {hourOptions.map((hour) => (
                            <SelectItem key={hour} value={hour}>{hour}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={habitForm.countdownTargetTime.split(":")[1] ?? ""}
                        onValueChange={(minute) =>
                          setHabitForm((s) => {
                            const currentHour = s.countdownTargetTime.split(":")[0] ?? "00";
                            return { ...s, countdownTargetTime: `${currentHour}:${minute}` };
                          })
                        }
                      >
                        <SelectTrigger><SelectValue placeholder="Minut" /></SelectTrigger>
                        <SelectContent>
                          {minuteOptions.map((minute) => (
                            <SelectItem key={minute} value={minute}>{minute}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ange datum och tid i 24h-format (ex: 16:00) som nedräkningen ska gå mot.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold text-blue-100">Tidsperiod</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    <Input type="date" value={habitForm.startDate} onChange={(e) => setHabitForm((s) => ({ ...s, startDate: e.target.value }))} />
                    <Input type="date" value={habitForm.endDate} onChange={(e) => setHabitForm((s) => ({ ...s, endDate: e.target.value }))} />
                  </div>
                  <p className="text-xs text-muted-foreground">Lämna slutdatum tomt om löftet ska fortsätta tills vidare.</p>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold text-blue-100">Registrering och frekvens</p>
              <div className="grid gap-2 md:grid-cols-2">
                <Select value={habitForm.trackingType} onValueChange={(v) => setHabitForm((s) => ({ ...s, trackingType: v as "BOOLEAN" | "NUMERIC" }))}>
                  <SelectTrigger><SelectValue placeholder="Typ" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BOOLEAN">Ja/nej</SelectItem>
                    <SelectItem value="NUMERIC">Numeriskt värde</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={habitForm.frequencyType} onValueChange={(v) => setHabitForm((s) => ({ ...s, frequencyType: v as "DAILY" | "WEEKDAYS" | "WEEKLY_TARGET" }))}>
                  <SelectTrigger><SelectValue placeholder="Frekvens" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAILY">Dagligen</SelectItem>
                    <SelectItem value="WEEKLY_TARGET">X gånger per vecka</SelectItem>
                    <SelectItem value="WEEKDAYS">Specifika dagar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
                  </div>
                </>
              )}
              {habitForm.templateType !== "COUNTDOWN" && habitForm.trackingType === "NUMERIC" ? (
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-blue-100">Numeriska värden</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    <Input placeholder="Namn på värde (ex. Distans)" value={habitForm.metricLabel} onChange={(e) => setHabitForm((s) => ({ ...s, metricLabel: e.target.value }))} />
                    <Input placeholder="Startvärde (valfritt)" value={habitForm.startValue} onChange={(e) => setHabitForm((s) => ({ ...s, startValue: e.target.value }))} />
                    <Input placeholder="Målvärde" value={habitForm.targetValue} onChange={(e) => setHabitForm((s) => ({ ...s, targetValue: e.target.value }))} />
                    <Select value={habitForm.goalComparator} onValueChange={(v) => setHabitForm((s) => ({ ...s, goalComparator: v as "GTE" | "LTE" | "EQ" }))}>
                    <SelectTrigger><SelectValue placeholder="Välj målregel" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GTE">Lika med eller högre</SelectItem>
                        <SelectItem value="LTE">Lika med eller lägre</SelectItem>
                        <SelectItem value="EQ">Exakt lika</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        Dynamiska delmål kan bara aktiveras om du har valt ett slutdatum.
                      </p>
                      <Select
                        value={habitForm.milestonesEnabled ? "JA" : "NEJ"}
                        onValueChange={(v) => setHabitForm((s) => ({ ...s, milestonesEnabled: v === "JA" }))}
                        disabled={!habitForm.endDate}
                      >
                      <SelectTrigger><SelectValue placeholder="Använd delmål?" /></SelectTrigger>
                        <SelectContent>
                        <SelectItem value="NEJ">Nej</SelectItem>
                        <SelectItem value="JA">Ja</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ) : null}
              {habitForm.templateType !== "COUNTDOWN" && habitForm.frequencyType === "WEEKLY_TARGET" ? (
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-blue-100">Veckomål</p>
                  <Input placeholder="Antal gånger per vecka (ex: 3)" value={habitForm.weeklyTarget} onChange={(e) => setHabitForm((s) => ({ ...s, weeklyTarget: e.target.value }))} />
                </div>
              ) : null}
              {habitForm.templateType !== "COUNTDOWN" && habitForm.frequencyType === "WEEKDAYS" ? (
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-blue-100">Välj dagar</p>
                  <div className="flex flex-wrap gap-2">
                  {weekdayOptions.map((weekday) => {
                    const active = habitForm.weekdays.includes(weekday.value);
                    return (
                      <Button
                        key={weekday.value}
                        variant={active ? "default" : "outline"}
                        size="sm"
                        className={cn(
                          active
                            ? "border-blue-300 bg-blue-500 text-white hover:bg-blue-500/90"
                            : "border-[#2da2ff66] bg-[#0f1832] text-blue-100 hover:bg-[#16264d]",
                        )}
                        onClick={() =>
                          setHabitForm((s) => ({
                            ...s,
                            weekdays: active ? s.weekdays.filter((d) => d !== weekday.value) : [...s.weekdays, weekday.value],
                          }))
                        }
                      >
                        {weekday.label}
                      </Button>
                    );
                  })}
                </div>
                </div>
              ) : null}
              <Button
                className="w-full md:w-auto"
                disabled={
                  isSubmitting ||
                  !habitForm.title ||
                  (habitForm.templateType === "COUNTDOWN"
                    ? !habitForm.countdownTargetDate || !habitForm.countdownTargetTime
                    : !habitForm.trackingType || !habitForm.frequencyType)
                }
                onClick={submitHabit}
              >
                Skapa löfte
              </Button>
              {feedback ? <p className="text-sm text-muted-foreground">{feedback}</p> : null}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="text-center"><CardTitle>Dagens registrering</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            {data.habits.filter((habit) => habit.templateType !== "COUNTDOWN").map((habit) => {
              const key = `${habit.id}:${format(new Date(), "yyyy-MM-dd")}`;
              const state = entryState[key] ?? { numericValue: "", checked: undefined };
              const isDone = doneToday.has(habit.id);
              const selectedBoolean = state.checked ?? reportedToday.get(habit.id);
              const hasNumericDraft = state.numericValue.trim().length > 0;
              const weekRow = weekRowByHabit.get(habit.id);
              const hasSavedNumericValueToday = weekRow?.cells[dayIndex]?.value != null;
              const nextScheduledCompletion = weekRow?.cells
                .slice(dayIndex + 1)
                .map((cell, idx) => ({ cell, idx: idx + dayIndex + 1 }))
                .find(({ cell }) => cell.scheduled && cell.done);
              const nextScheduledValue = nextScheduledCompletion?.cell.value;
              const preLoggedFuture =
                habit.trackingType === "NUMERIC" && !isDone && Boolean(nextScheduledCompletion);
              const cardToneClass =
                selectedBoolean === false
                  ? "border-rose-400/60 bg-rose-500/10"
                  : selectedBoolean === true || preLoggedFuture || (habit.trackingType === "NUMERIC" && isDone)
                    ? "border-emerald-400/60 bg-emerald-500/10"
                    : weekRow?.frequencyType === "WEEKLY_TARGET"
                      ? "border-amber-400/60 bg-amber-500/10"
                      : "border";
              return (
                <div key={habit.id} className={cn("rounded-lg p-3 sm:p-4 transition-colors", cardToneClass)}>
                  <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-base font-medium">{habit.title}</p>
                      {habit.challengeId ? (
                        <p className="text-xs text-amber-500">{habit.challengeLabel ?? "Utmaningslöfte"}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        {habit.metricLabel ? `${habit.metricLabel} (${comparatorText(habit.goalComparator)} ${habit.targetValue ?? "-"})` : "Ja/nej-löfte"}
                        {habit.templateType === "BANK" ? " · Saldo: " : ""}
                        {habit.templateType === "BANK" ? (
                          <span
                            className={(data.bankCarryoverByHabit[habit.id] ?? 0) >= 0 ? "text-green-500" : "text-red-500"}
                          >
                            {(data.bankCarryoverByHabit[habit.id] ?? 0) >= 0 ? "+" : ""}
                            {data.bankCarryoverByHabit[habit.id] ?? 0}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Slutdatum: {habit.endDate ?? "—"}
                        {habit.endDateLocked ? " (utmaning)" : ""}
                      </p>
                      {getRegistrationHint(habit.id) ? (
                        <p className="text-xs text-muted-foreground">{getRegistrationHint(habit.id)}</p>
                      ) : null}
                      {preLoggedFuture && nextScheduledCompletion ? (
                        <p className="text-xs text-emerald-300">
                          Värdet uppdaterades
                          {nextScheduledValue != null ? ` till ${nextScheduledValue}` : ""}
                          {" "}idag och rapporteras på {weekdayNamesFull[(nextScheduledCompletion.idx + 1) % 7]}.
                        </p>
                      ) : null}
                    </div>
                    <div className="grid w-full shrink-0 grid-cols-1 gap-2 sm:w-auto sm:flex sm:flex-row sm:items-center">
                      <Button className="w-full sm:w-auto" variant="outline" size="sm" disabled={isSubmitting} onClick={() => openHabitSettings(habit)}>
                        Justera mål / datum
                      </Button>
                      <Button className="w-full sm:w-auto" variant="outline" size="sm" disabled={isSubmitting} onClick={() => deleteHabit(habit.id, habit.title)}>Ta bort</Button>
                    </div>
                  </div>
                  {habitSettingsOpenId === habit.id ? (
                    <div className="mb-3 space-y-3 rounded-md border bg-muted/30 p-3 text-sm">
                      <p className="text-xs text-muted-foreground">Startdatum (låst): {habit.startDate}</p>
                      <div className="space-y-1">
                        <label className="text-xs font-medium" htmlFor={`habit-end-${habit.id}`}>Slutdatum</label>
                        <Input
                          id={`habit-end-${habit.id}`}
                          type="date"
                          min={habit.startDate}
                          disabled={habit.endDateLocked || isSubmitting}
                          value={habitSettingsDraft.endDate}
                          onChange={(e) => setHabitSettingsDraft((s) => ({ ...s, endDate: e.target.value }))}
                        />
                        {habit.endDateLocked ? (
                          <p className="text-xs text-muted-foreground">Slutdatum styrs av utmaningen.</p>
                        ) : (
                          <p className="text-xs text-muted-foreground">Lämna tomt för löfte utan slutdatum.</p>
                        )}
                      </div>
                      {habit.trackingType === "NUMERIC" ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            <label className="text-xs font-medium" htmlFor={`habit-target-${habit.id}`}>Målvärde</label>
                            <Input
                              id={`habit-target-${habit.id}`}
                              placeholder={habit.metricLabel ?? "Mål"}
                              value={habitSettingsDraft.targetValue}
                              onChange={(e) => setHabitSettingsDraft((s) => ({ ...s, targetValue: e.target.value }))}
                              disabled={isSubmitting}
                            />
                          </div>
                          <div className="space-y-1">
                            <span className="text-xs font-medium">Målregel</span>
                            <Select
                              value={habitSettingsDraft.goalComparator}
                              onValueChange={(v) =>
                                setHabitSettingsDraft((s) => ({ ...s, goalComparator: v as "GTE" | "LTE" | "EQ" }))
                              }
                              disabled={isSubmitting}
                            >
                              <SelectTrigger id={`habit-comp-${habit.id}`}>
                                <SelectValue placeholder="Regel" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="GTE">Lika med eller högre</SelectItem>
                                <SelectItem value="LTE">Lika med eller lägre</SelectItem>
                                <SelectItem value="EQ">Exakt lika</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" disabled={isSubmitting} onClick={() => saveHabitSettings(habit)}>
                          Spara ändringar
                        </Button>
                        <Button size="sm" variant="ghost" type="button" disabled={isSubmitting} onClick={() => setHabitSettingsOpenId(null)}>
                          Stäng
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {habit.trackingType === "NUMERIC" ? (
                    <div className="space-y-2">
                      <Input placeholder={habit.metricLabel ?? "Värde"} value={state.numericValue} onChange={(e) => setEntryState((p) => ({ ...p, [key]: { ...state, numericValue: e.target.value } }))} />
                      {hasNumericDraft || hasSavedNumericValueToday ? (
                        <Button
                          className="w-full sm:w-auto"
                          variant="outline"
                          disabled={isSubmitting}
                          onClick={() => clearNumericEntry(habit, key, Boolean(hasSavedNumericValueToday))}
                        >
                          Ta bort inmatning
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:flex">
                      <Button
                        className="w-full sm:w-auto"
                        variant={selectedBoolean === true ? "default" : "outline"}
                        disabled={isSubmitting}
                        onClick={() => {
                          setEntryState((prev) => ({ ...prev, [key]: { ...state, checked: true } }));
                          saveEntry(habit, format(new Date(), "yyyy-MM-dd"), true);
                        }}
                      >
                        Ja
                      </Button>
                      <Button
                        className="w-full sm:w-auto"
                        variant={selectedBoolean === false ? "destructive" : "outline"}
                        disabled={isSubmitting}
                        onClick={() => {
                          setEntryState((prev) => ({ ...prev, [key]: { ...state, checked: false } }));
                          saveEntry(habit, format(new Date(), "yyyy-MM-dd"), false);
                        }}
                      >
                        Nej
                      </Button>
                    </div>
                  )}
                  {habit.trackingType === "NUMERIC" ? (
                    <Button className="mt-2 w-full sm:w-auto" variant={isDone ? "default" : "outline"} disabled={isSubmitting} onClick={() => saveEntry(habit)}>
                      {isDone ? "Ändra" : "Klarmarkera"}
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>

      {data.countdownCards.length > 0 ? (
        <section className="grid gap-4 md:grid-cols-2">
          {data.countdownCards.map((countdown) => (
            <Card key={countdown.habitId}>
              <CardHeader className="text-center">
                <CardTitle>{countdown.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-center">
                <p className="text-3xl font-semibold">{formatCountdown(countdown.targetDate)}</p>
                <p className="text-xs text-muted-foreground">
                  Mål: {countdown.targetDate ? format(new Date(countdown.targetDate), "yyyy-MM-dd HH:mm") : "saknas"}
                </p>
                <p className="text-xs text-blue-100/80">
                  {getCountdownFact(countdown.targetDate, countdown.habitId)}
                </p>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      {data.pendingCards.length > 0 ? (
        <section>
          <Card>
            <CardHeader><CardTitle>Saknade dagar (retroaktivt)</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              {data.pendingCards.map((card) => {
                const habit = data.habits.find((h) => h.id === card.habitId);
                if (!habit) return null;
                const key = `${card.habitId}:${card.dateLabel}`;
                const state = entryState[key] ?? { numericValue: "", checked: undefined };
                return (
                  <div key={key} className="rounded-lg border p-3">
                    <p className="font-medium">{card.title}</p>
                    <p className="mb-2 text-xs text-muted-foreground">{card.dateLabel}</p>
                    {card.trackingType === "NUMERIC" ? (
                      <div className="space-y-2">
                        <Input placeholder={card.metricLabel ?? "Värde"} value={state.numericValue} onChange={(e) => setEntryState((p) => ({ ...p, [key]: { ...state, numericValue: e.target.value } }))} />
                        <Button
                          variant="outline"
                          onClick={() => saveEntry(habit, card.date, false)}
                          disabled={isSubmitting}
                        >
                          Inte utförd
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-2 flex gap-2">
                        <Button
                          variant="default"
                          onClick={() => saveEntry(habit, card.date, true)}
                          disabled={isSubmitting}
                        >
                          Ja
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => saveEntry(habit, card.date, false)}
                          disabled={isSubmitting}
                        >
                          Nej
                        </Button>
                      </div>
                    )}
                    {card.trackingType === "NUMERIC" ? (
                      <Button className="mt-2" onClick={() => saveEntry(habit, card.date)} disabled={isSubmitting}>Klarmarkera</Button>
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        {data.habitCharts.length === 0 ? (
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Grafer skapas av dina löften</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Skapa ett numeriskt löfte och registrera några dagar så visas grafen här.
            </CardContent>
          </Card>
        ) : (
          data.habitCharts.map((chart) => (
            <Card
              key={chart.habitId}
              className="cursor-pointer transition-colors hover:bg-card/80"
              onClick={() => replayChart(chart.habitId)}
            >
              <CardHeader className="text-center">
                <CardTitle className="text-center">{chart.title}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {chart.metricLabel}
                  {chart.targetValue != null ? ` · Mål: ${chart.targetValue}` : ""}
                </p>
                {chart.targetValue != null ? (
                  <p className="text-xs text-muted-foreground">
                    {chart.startValue != null ? `Start: ${chart.startValue} · ` : ""}
                    Mål: {chart.targetValue}
                    {chart.percentDiff != null ? ` · Förändring: ${chart.percentDiff}%` : ""}
                  </p>
                ) : null}
                {chart.nextMilestone != null ? (
                  <p className="text-xs text-muted-foreground">
                    Nästa delmål: {chart.nextMilestone}
                    {chart.nextMilestoneDate ? ` (${chart.nextMilestoneDate})` : ""}
                    <span className={chart.aheadOfPace ? "ml-2 text-green-500" : "ml-2 text-muted-foreground"}>
                      <Check className="inline h-3.5 w-3.5" />
                    </span>
                  </p>
                ) : null}
              </CardHeader>
              <CardContent className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    key={`${chart.habitId}-${chartReplayKey[chart.habitId] ?? 0}`}
                    data={chart.points}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis
                      domain={
                        chart.targetValue != null
                          ? [
                              (dataMin: number) => {
                                const targetFloor = chart.targetValue! * 0.9;
                                return Math.floor(Math.min(dataMin, targetFloor));
                              },
                              (dataMax: number) => Math.ceil(Math.max(dataMax, chart.targetValue! * 1.1)),
                            ]
                          : ["dataMin - 1", "dataMax + 1"]
                      }
                    />
                    <Tooltip />
                    {chart.targetValue != null ? (
                      <ReferenceLine
                        y={chart.targetValue}
                        stroke="#22c55e"
                        strokeDasharray="6 6"
                        strokeWidth={2}
                        label={{ value: "Mål", position: "insideTopRight" }}
                      />
                    ) : null}
                    {chart.expectedToday != null ? (
                      <Line
                        type="monotone"
                        dataKey="pace"
                        stroke="#f59e0b"
                        strokeDasharray="4 4"
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                        isAnimationActive
                        animationBegin={700}
                        animationDuration={1800}
                        animationEasing="ease-in-out"
                      />
                    ) : null}
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#60a5fa"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#60a5fa", stroke: "#1e3a8a", strokeWidth: 1 }}
                      activeDot={{ r: 5, fill: "#93c5fd", stroke: "#1e3a8a", strokeWidth: 1.5 }}
                      connectNulls
                      isAnimationActive
                      animationBegin={1700}
                      animationDuration={2200}
                      animationEasing="ease-in-out"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ))
        )}
      </section>

      <section className="grid gap-6">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="w-full text-center">Veckoöversikt</CardTitle>
            <Badge variant="secondary">{format(new Date(), "yyyy-MM-dd")}</Badge>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Löfte</TableHead>
                  <TableHead>Mån</TableHead>
                  <TableHead>Tis</TableHead>
                  <TableHead>Ons</TableHead>
                  <TableHead>Tor</TableHead>
                  <TableHead>Fre</TableHead>
                  <TableHead>Lör</TableHead>
                  <TableHead>Sön</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.weekGrid.map((row) => (
                  <TableRow key={row.habitId}>
                    <TableCell>
                      <div className="space-y-1">
                        <p>
                          {row.title}
                          {row.frequencyType === "WEEKLY_TARGET"
                            ? ` (${Math.max((row.weeklyTarget ?? 0) - row.cells.filter((cell) => cell.done).length, 0)} kvar)`
                            : ""}
                        </p>
                        {row.challengeId ? (
                          <p className="text-xs text-amber-500">{row.challengeLabel ?? "Utmaningslöfte"}</p>
                        ) : null}
                      </div>
                    </TableCell>
                    {row.cells.map((cell) => (
                      <TableCell key={cell.date} className="text-center">
                        {cell.done ? (
                          <span className="inline-flex items-center justify-center text-green-500"><Check className="h-4 w-4" /></span>
                        ) : cell.failed ? (
                          <span className="inline-flex items-center justify-center text-red-500"><X className="h-4 w-4" /></span>
                        ) : cell.scheduled ? (
                          <span className="text-muted-foreground">P</span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section className="flex justify-center">
        <Button variant="outline" onClick={() => signOut({ callbackUrl: "/" })}>Logga ut</Button>
      </section>
    </div>
  );
}
