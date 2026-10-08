/** 定型業務の「いまの回」の開始日と期限（日付は JST の YYYY-MM-DD） */
export type RoutineSchedule = { every: "week" | "month"; weekday: number | null; day: number | null; grace_days: number };

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function currentPeriod(s: RoutineSchedule, today: string): { start: string; due: string } {
  let start: string;
  if (s.every === "week") {
    const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
    start = addDays(today, -((dow - (s.weekday ?? 1) + 7) % 7));
  } else {
    const day = String(s.day ?? 1).padStart(2, "0");
    start = `${today.slice(0, 7)}-${day}`;
    if (start > today) {
      const prev = new Date(Date.parse(`${today.slice(0, 7)}-01T12:00:00Z`) - 86_400_000).toISOString().slice(0, 7);
      start = `${prev}-${day}`;
    }
  }
  return { start, due: addDays(start, s.grace_days) };
}
