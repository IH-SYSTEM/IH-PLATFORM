import Link from "next/link";
import { REPORT_TYPES } from "@/lib/reports/registry";
import { CATEGORIES, type CategoryKey } from "@/lib/reports/types";

// 区分の並びと見た目。相談窓口は最後に、ほかと分けて出す
const ORDER: CategoryKey[] = ["request", "attendance", "site", "harassment"];
const ACCENT: Record<CategoryKey, string> = {
  request: "border-t-brand",
  attendance: "border-t-brand",
  site: "border-t-amber-500",
  harassment: "border-t-slate-500",
};

/** 報告窓口の入口：区分ごとに、出せる報告の種類を並べる */
export function ReportCatalog() {
  return (
      <div className="grid gap-4 lg:grid-cols-2">
        {ORDER.map((cat) => {
          const types = REPORT_TYPES.filter((t) => t.category === cat);
          if (!types.length) return null;
          return (
            <section key={cat} className={`rounded-md border border-line border-t-4 bg-white p-5 ${ACCENT[cat]}`}>
              <h2 className="text-base font-bold text-slate-900">{CATEGORIES[cat].label}</h2>
              <p className="mt-0.5 text-xs text-slate-500">{CATEGORIES[cat].description}</p>
              <ul className="mt-3 divide-y divide-line">
                {types.map((t) => (
                  <li key={t.key}>
                    <Link href={`/reports/new/${t.key}`} className="group flex items-center justify-between gap-3 py-3">
                      <span>
                        <span className="block text-sm font-bold text-slate-800 group-hover:text-brand">{t.title}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">{t.description}</span>
                      </span>
                      <span className="shrink-0 text-slate-300 group-hover:text-brand">›</span>
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
