import Link from "next/link";

/** スタッフ本人のシフト画面の切り替え（確定スケジュール／シフト希望） */
export function MyShiftTabs({ active }: { active: "mine" | "request" }) {
  return (
    <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm font-bold">
      {(
        [
          ["mine", "/shifts/mine", "確定スケジュール"],
          ["request", "/shifts/request", "シフト希望"],
        ] as const
      ).map(([k, href, label]) => (
        <Link key={k} href={href} className={`flex-1 rounded-md px-4 py-2 text-center ${active === k ? "bg-white text-brand shadow-sm" : "text-slate-500"}`}>
          {label}
        </Link>
      ))}
    </div>
  );
}
