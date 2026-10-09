import Link from "next/link";
import type { Announcement } from "@/lib/announcements";
import { hm } from "@/lib/shifts";
import { markRoutineDone } from "./routine-actions";
import { AskBox } from "./ask-box";

// ホームの見た目（データの取得は page.tsx）
// tone: alert＝要対応（赤）／task＝定型業務（紺）。done があれば「済」ボタンを出す
export type Todo = {
  label: string;
  href: string;
  tone?: "alert" | "task";
  done?: { routineId: string; periodStart: string };
};
export type HomeWork = {
  shift: {
    planned_start: string | null;
    planned_end: string | null;
    work_role: string | null;
  } | null;
  storeName: string | null;
  punchLabel: string;
  working: boolean;
  todos: Todo[];
};

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  });

function Section({
  title,
  children,
  empty,
}: {
  title: string;
  children: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-bold tracking-[0.2em] text-slate-400">
        {title}
      </h2>
      {empty ? (
        <p className="rounded-md border border-line bg-white px-4 py-5 text-center text-sm text-slate-400">
          いまはありません
        </p>
      ) : (
        children
      )}
    </section>
  );
}

function NoticeList({ items }: { items: Announcement[] }) {
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-md border border-line bg-white">
      {items.map((a) => (
        <li key={a.id} className="px-4 py-3">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-start gap-3">
              <span className="w-10 shrink-0 pt-0.5 text-xs tabular-nums text-slate-400">
                {day(a.published_at)}
              </span>
              <span className="min-w-0 flex-1 text-sm font-bold text-slate-900">
                {a.pinned && (
                  <span className="mr-1.5 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent">
                    重要
                  </span>
                )}
                {a.title}
              </span>
              {(a.body || a.url) && (
                <span className="shrink-0 text-slate-300 transition group-open:rotate-90">
                  ›
                </span>
              )}
            </summary>
            {(a.body || a.url) && (
              <div className="mt-2 pl-13 text-sm text-slate-600">
                {a.body && <p className="whitespace-pre-wrap">{a.body}</p>}
                {a.url && (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block font-bold text-brand hover:underline"
                  >
                    くわしく見る ›
                  </a>
                )}
              </div>
            )}
          </details>
        </li>
      ))}
    </ul>
  );
}

function NewsList({ items }: { items: Announcement[] }) {
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-md border border-line bg-white">
      {items.map((a) => (
        <li key={a.id}>
          <a
            href={a.url ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-slate-900">
                {a.title}
              </span>
              {a.body && (
                <span className="mt-0.5 block text-xs text-slate-500">
                  {a.body}
                </span>
              )}
              <span className="mt-1 block text-[11px] text-slate-400">
                {a.source ? `${a.source}・` : ""}
                {day(a.published_at)}
              </span>
            </span>
            <span className="shrink-0 pt-0.5 text-slate-300">↗</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function HomeView({
  name,
  today,
  work,
  notices,
  system,
  news,
}: {
  name: string;
  today: string;
  work: HomeWork;
  notices: Announcement[];
  system: Announcement[];
  news: Announcement[];
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-7">
      <Section title="本日の業務">
        <div className="overflow-hidden rounded-md border border-line bg-white">
          <div className="bg-brand px-5 py-4 text-white">
            <p className="text-xs text-white/70">
              {today}　{name}さん
            </p>
            {work.shift ? (
              <>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {hm(work.shift.planned_start)}〜{hm(work.shift.planned_end)}
                </p>
                <p className="mt-0.5 text-sm text-white/85">
                  {work.storeName ?? ""}
                  {work.shift.work_role ? `・${work.shift.work_role}` : ""}
                </p>
              </>
            ) : (
              <p className="mt-1 text-xl font-bold">今日のシフトはありません</p>
            )}
            <p
              className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-bold ${work.working ? "bg-white text-brand" : "bg-white/15 text-white"}`}
            >
              {work.punchLabel}
            </p>
          </div>
          {work.todos.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {work.todos.map((t) => (
                <li
                  key={t.label}
                  className={`flex items-center ${t.tone === "alert" ? "bg-accent-soft/40" : ""}`}
                >
                  <Link
                    href={t.href}
                    className="flex min-w-0 flex-1 items-center gap-3 px-5 py-3 text-sm hover:bg-slate-50"
                  >
                    <span
                      className={`size-2 shrink-0 rounded-full ${t.tone === "task" ? "bg-brand" : "bg-accent"}`}
                    />
                    <span
                      className={`flex-1 font-bold ${t.tone === "alert" ? "text-accent" : "text-slate-900"}`}
                    >
                      {t.label}
                    </span>
                    <span className="text-slate-300">›</span>
                  </Link>
                  {t.done && (
                    <form
                      action={markRoutineDone.bind(
                        null,
                        t.done.routineId,
                        t.done.periodStart,
                      )}
                      className="pr-4"
                    >
                      <button className="rounded-full px-3 py-1 text-xs font-bold text-brand ring-1 ring-slate-200 hover:bg-brand hover:text-white">
                        済
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>
      <Section title="AI取説（使い方を聞く）">
        <AskBox />
      </Section>
      <Section title="会社からのお知らせ" empty={!notices.length}>
        <NoticeList items={notices} />
      </Section>
      <Section title="システムの更新" empty={!system.length}>
        <NoticeList items={system} />
      </Section>
      <Section title="全国ニュース" empty={!news.length}>
        <NewsList items={news} />
      </Section>
    </div>
  );
}
