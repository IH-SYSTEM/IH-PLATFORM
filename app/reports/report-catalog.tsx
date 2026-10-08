import Link from "next/link";
import { REPORT_TYPES } from "@/lib/reports/registry";
import { CATEGORIES, type CategoryKey } from "@/lib/reports/types";

// 区分の並びと色。相談窓口は最後に、ほかと分けて出す
const ORDER: CategoryKey[] = ["request", "attendance", "site", "harassment"];
const TONE: Record<CategoryKey, { band: string; mark: string; letter: string }> = {
  request: { band: "bg-brand", mark: "bg-white/15 text-white", letter: "申" },
  attendance: { band: "bg-brand-2", mark: "bg-white/15 text-white", letter: "勤" },
  site: { band: "bg-amber-600", mark: "bg-white/20 text-white", letter: "現" },
  harassment: { band: "bg-slate-600", mark: "bg-white/15 text-white", letter: "相" },
};

/**
 * 報告窓口の入口。区分は色の帯の見出し、報告の種類は枠つきのボタンにして、見出しとボタンを見分けやすくする
 */
export function ReportCatalog() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {ORDER.map((cat) => {
        const types = REPORT_TYPES.filter((t) => t.category === cat);
        if (!types.length) return null;
        const tone = TONE[cat];
        return (
          <section key={cat} className="overflow-hidden rounded-md border border-line bg-white">
            <header className={`flex items-center gap-3 px-5 py-3.5 text-white ${tone.band}`}>
              <span className={`grid size-9 shrink-0 place-items-center rounded-md text-base font-bold ${tone.mark}`}>{tone.letter}</span>
              <div className="min-w-0">
                <h2 className="text-base font-bold leading-tight">{CATEGORIES[cat].label}</h2>
                <p className="mt-0.5 truncate text-xs text-white/75">{CATEGORIES[cat].description}</p>
              </div>
            </header>
            <ul className="grid gap-2 p-4">
              {types.map((t) => (
                <li key={t.key}>
                  <Link
                    href={`/reports/new/${t.key}`}
                    className="group flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 transition hover:border-brand hover:bg-white hover:shadow-sm"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-slate-900 group-hover:text-brand">{t.title}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{t.description}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold text-brand ring-1 ring-slate-200 group-hover:bg-brand group-hover:text-white group-hover:ring-brand">
                      報告する
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
