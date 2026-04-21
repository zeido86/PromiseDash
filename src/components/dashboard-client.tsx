"use client";

import { format, parseISO, subMonths, subYears } from "date-fns";
import { Check, X } from "lucide-react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type HabitTemplateType = "STANDARD" | "GRAPH" | "BANK";
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

type EntryState = Record<string, { numericValue: string; checked?: boolean }>;
type ChartRange = "since_start" | "year" | "half_year" | "three_months";

export function DashboardClient({ data }: { data: DashboardData }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showCreateHabit, setShowCreateHabit] = useState(false);
  const [showChallengeCard, setShowChallengeCard] = useState(false);

  const [habitForm, setHabitForm] = useState({
    templateType: "STANDARD" as HabitTemplateType,
    title: "",
    trackingType: "NUMERIC" as "BOOLEAN" | "NUMERIC",
    metricLabel: "Distans",
    startValue: "",
    goalLabel: "Måldistans",
    targetValue: "",
    goalComparator: "GTE" as "GTE" | "LTE" | "EQ",
    frequencyType: "WEEKLY_TARGET" as "DAILY" | "WEEKDAYS" | "WEEKLY_TARGET",
    weeklyTarget: "3",
    scheduleMode: "FLEXIBLE" as "FIXED" | "FLEXIBLE",
    weekdays: [] as number[],
    startDate: format(new Date(), "yyyy-MM-dd"),
    endDate: "",
    startWeight: "",
    weighInWeekday: "5",
    milestonesEnabled: false,
  });
  const [entryState, setEntryState] = useState<EntryState>({});
  const [chartRange, setChartRange] = useState<Record<string, ChartRange>>({});
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

  function parseNumeric(value: string): number | undefined {
    if (!value.trim()) return undefined;
    const normalized = value.replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  const dayIndex = (new Date().getDay() + 6) % 7;
  const doneToday = new Set(
    data.weekGrid.filter((row) => row.cells[dayIndex]?.done).map((row) => row.habitId),
  );
  const reportedToday = new Map<string, boolean | undefined>(
    data.weekGrid.map((row) => {
      const cell = row.cells[dayIndex];
      if (!cell) return [row.habitId, undefined];
      if (cell.done) return [row.habitId, true];
      if (cell.failed) return [row.habitId, false];
      return [row.habitId, undefined];
    }),
  );

  function applyTemplate(templateType: HabitTemplateType) {
    if (templateType === "GRAPH") {
      setHabitForm((s) => ({
        ...s,
        templateType,
        title: "Ny graf",
        trackingType: "NUMERIC",
        metricLabel: "Värde",
        startValue: "",
        goalLabel: "Målvärde",
      }));
      return;
    }
    if (templateType === "BANK") {
      setHabitForm((s) => ({
        ...s,
        templateType,
        title: "Kaloribank",
        trackingType: "NUMERIC",
        metricLabel: "Kaloriintag",
        startValue: "",
        goalLabel: "Dagligt mål",
        goalComparator: "LTE",
        targetValue: "2200",
        frequencyType: "DAILY",
        weeklyTarget: "7",
      }));
      return;
    }
    setHabitForm((s) => ({
      ...s,
      templateType,
      title: "",
      trackingType: "NUMERIC",
      metricLabel: "Distans",
      startValue: "",
      goalLabel: "Måldistans",
      goalComparator: "GTE",
      targetValue: "",
      frequencyType: "WEEKLY_TARGET",
      weeklyTarget: "3",
    }));
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
    await run(async () => {
      await postJson("/api/habits", {
        title: habitForm.title,
        templateType: habitForm.templateType,
        trackingType: habitForm.trackingType,
        metricLabel: habitForm.trackingType === "NUMERIC" ? habitForm.metricLabel : undefined,
        startValue: habitForm.trackingType === "NUMERIC" ? parseNumeric(habitForm.startValue) : undefined,
        goalLabel:
          habitForm.trackingType === "NUMERIC"
            ? habitForm.milestonesEnabled
              ? "Delmål"
              : "Mål"
            : undefined,
        goalComparator: habitForm.trackingType === "NUMERIC" ? habitForm.goalComparator : undefined,
        targetValue:
          habitForm.trackingType === "NUMERIC" ? parseNumeric(habitForm.targetValue) : undefined,
        frequencyType: habitForm.frequencyType,
        scheduleMode: habitForm.frequencyType === "WEEKDAYS" ? "FIXED" : "FLEXIBLE",
        weeklyTarget:
          habitForm.frequencyType === "WEEKLY_TARGET" && habitForm.weeklyTarget
            ? Number(habitForm.weeklyTarget)
            : undefined,
        weekdays: habitForm.frequencyType === "WEEKDAYS" ? habitForm.weekdays : [],
        startDate: new Date(`${habitForm.startDate}T12:00:00`).toISOString(),
        endDate: habitForm.endDate ? new Date(`${habitForm.endDate}T12:00:00`).toISOString() : undefined,
        setupWeightProfile:
          habitForm.templateType === "GRAPH" && habitForm.metricLabel.toLowerCase().includes("vikt") && habitForm.startWeight
            ? { startWeight: Number(habitForm.startWeight), weighInWeekday: Number(habitForm.weighInWeekday) }
            : undefined,
        setupCalorieProfile:
          habitForm.templateType === "BANK" && parseNumeric(habitForm.targetValue)
            ? { dailyTarget: Number(parseNumeric(habitForm.targetValue)) }
            : undefined,
        milestonesEnabled: habitForm.milestonesEnabled && !!habitForm.endDate,
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

  function filterChartPoints(points: Array<{ date: string; isoDate?: string; value: number; pace?: number | null }>, range: ChartRange) {
    if (range === "since_start") return points;

    const today = new Date();
    const threshold =
      range === "year" ? subYears(today, 1) : range === "half_year" ? subMonths(today, 6) : subMonths(today, 3);

    return points.filter((point) => (point.isoDate ? parseISO(point.isoDate) >= threshold : true));
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
      <section className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader><CardTitle>Dagens löften</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{data.summary.completedToday}/{data.summary.totalToday}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Veckoprogress</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-3xl font-semibold">{data.summary.weekProgress}%</p>
            <Progress value={data.summary.weekProgress} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Aktiva löften</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{data.summary.activeHabits}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Status</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">Du ligger på {data.summary.weekDone} registreringar den här veckan.</CardContent>
        </Card>
      </section>

      <section className="flex justify-end">
        <Button variant="outline" onClick={() => setShowCreateHabit((prev) => !prev)}>
          {showCreateHabit ? "Dölj skapa löfte" : "Nytt löfte"}
        </Button>
      </section>

      <section className="flex justify-end">
        <Button variant="outline" onClick={() => setShowChallengeCard((prev) => !prev)}>
          {showChallengeCard ? "Dölj utmaningar" : "Ny utmaning"}
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
              <CardTitle>Skapa nytt löfte</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={habitForm.templateType} onValueChange={(v) => applyTemplate(v as HabitTemplateType)}>
                <SelectTrigger><SelectValue placeholder="Välj löftestyp" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="STANDARD">Standard</SelectItem>
                  <SelectItem value="GRAPH">Graf</SelectItem>
                  <SelectItem value="BANK">Bank</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="Titel på löftet" value={habitForm.title} onChange={(e) => setHabitForm((s) => ({ ...s, title: e.target.value }))} />
              <div className="grid gap-2 md:grid-cols-2">
                <Input type="date" value={habitForm.startDate} onChange={(e) => setHabitForm((s) => ({ ...s, startDate: e.target.value }))} />
                <Input type="date" value={habitForm.endDate} onChange={(e) => setHabitForm((s) => ({ ...s, endDate: e.target.value }))} />
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <Select value={habitForm.trackingType} onValueChange={(v) => setHabitForm((s) => ({ ...s, trackingType: v as "BOOLEAN" | "NUMERIC" }))}>
                  <SelectTrigger><SelectValue placeholder="Välj registreringssätt" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BOOLEAN">Ja/nej</SelectItem>
                    <SelectItem value="NUMERIC">Numeriskt värde</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={habitForm.frequencyType} onValueChange={(v) => setHabitForm((s) => ({ ...s, frequencyType: v as "DAILY" | "WEEKDAYS" | "WEEKLY_TARGET" }))}>
                  <SelectTrigger><SelectValue placeholder="Välj frekvens" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAILY">Dagligen</SelectItem>
                    <SelectItem value="WEEKLY_TARGET">X gånger per vecka</SelectItem>
                    <SelectItem value="WEEKDAYS">Specifika dagar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {habitForm.trackingType === "NUMERIC" ? (
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
              ) : null}
              {habitForm.frequencyType === "WEEKLY_TARGET" ? (
                <Input placeholder="Antal gånger per vecka" value={habitForm.weeklyTarget} onChange={(e) => setHabitForm((s) => ({ ...s, weeklyTarget: e.target.value }))} />
              ) : null}
              {habitForm.frequencyType === "WEEKDAYS" ? (
                <div className="flex flex-wrap gap-2">
                  {weekdayOptions.map((weekday) => {
                    const active = habitForm.weekdays.includes(weekday.value);
                    return (
                      <Button
                        key={weekday.value}
                        variant={active ? "default" : "outline"}
                        size="sm"
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
              ) : null}
              <Button disabled={isSubmitting || !habitForm.title} onClick={submitHabit}>Skapa löfte</Button>
              {feedback ? <p className="text-sm text-muted-foreground">{feedback}</p> : null}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader><CardTitle>Dagens registrering (kort)</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            {data.habits.map((habit) => {
              const key = `${habit.id}:${format(new Date(), "yyyy-MM-dd")}`;
              const state = entryState[key] ?? { numericValue: "", checked: undefined };
              const isDone = doneToday.has(habit.id);
              const selectedBoolean = state.checked ?? reportedToday.get(habit.id);
              return (
                <div key={habit.id} className="rounded-lg border p-3">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{habit.title}</p>
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
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                      <Button variant="outline" size="sm" disabled={isSubmitting} onClick={() => openHabitSettings(habit)}>
                        Justera mål / datum
                      </Button>
                      <Button variant="outline" size="sm" disabled={isSubmitting} onClick={() => deleteHabit(habit.id, habit.title)}>Ta bort</Button>
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
                      <Button
                        variant="outline"
                        disabled={isSubmitting}
                        onClick={() => saveEntry(habit, format(new Date(), "yyyy-MM-dd"), false)}
                      >
                        Inte utförd
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-2 flex gap-2">
                      <Button
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
                    <Button className="mt-2" variant={isDone ? "default" : "outline"} disabled={isSubmitting} onClick={() => saveEntry(habit)}>
                      {isDone ? "Ändra" : "Klarmarkera"}
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>

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
              <CardHeader>
                <CardTitle>{chart.title}</CardTitle>
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
                <Select
                  value={chartRange[chart.habitId] ?? "since_start"}
                  onValueChange={(value) =>
                    setChartRange((prev) => ({
                      ...prev,
                      [chart.habitId]: value as ChartRange,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Tidsperiod" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="since_start">Sedan start</SelectItem>
                    <SelectItem value="year">Senaste året</SelectItem>
                    <SelectItem value="half_year">Senaste halvåret</SelectItem>
                    <SelectItem value="three_months">Senaste 3 månaderna</SelectItem>
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    key={`${chart.habitId}-${chartReplayKey[chart.habitId] ?? 0}`}
                    data={filterChartPoints(chart.points, chartRange[chart.habitId] ?? "since_start")}
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
            <CardTitle>Veckoöversikt</CardTitle>
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
                        <p>{row.title}</p>
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

      <section className="flex justify-end">
        <Button variant="outline" onClick={() => signOut({ callbackUrl: "/" })}>Logga ut</Button>
      </section>
    </div>
  );
}
