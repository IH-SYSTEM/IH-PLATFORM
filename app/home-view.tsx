import Link from "next/link";
import type { Announcement } from "@/lib/announcements";
import { hm } from "@/lib/shifts";

// ホームの見た目（データの取得は page.tsx）
export type Todo = { label: string; href: string };
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
                <li key={t.label}>
                  <Link
                    href={t.href}
                    className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-slate-50"
                  >
                    <span className="size-2 shrink-0 rounded-full bg-accent" />
                    <span className="flex-1 font-bold text-slate-900">
                      {t.label}
                    </span>
                    <span className="text-slate-300">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
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
