import Link from "next/link";
import type { ReactNode } from "react";

/** AIの答えの最低限の書式：見出し・箇条書き・**太字**・[リンク](/パス) */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) {
      const href = m[2];
      out.push(
        href.startsWith("/") ? (
          <Link key={`${key}-${i++}`} href={href} className="font-bold text-brand underline underline-offset-2">
            {m[1]}
          </Link>
        ) : href.startsWith("https://") ? (
          <a key={`${key}-${i++}`} href={href} target="_blank" rel="noreferrer" className="font-bold text-brand underline underline-offset-2">
            {m[1]}
          </a>
        ) : (
          m[1]
        ),
      );
    } else out.push(<b key={`${key}-${i++}`}>{m[3]}</b>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function RichText({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {text.split("\n").map((line, n) => {
        const key = String(n);
        if (!line.trim()) return <div key={key} className="h-1" />;
        const h = line.match(/^#{1,4}\s+(.*)/);
        if (h) return <p key={key} className="pt-1 font-bold text-slate-900">{inline(h[1], key)}</p>;
        const li = line.match(/^\s*([-・*]|\d+[.)．])\s+(.*)/);
        if (li)
          return (
            <p key={key} className="flex gap-2 pl-1">
              <span className="shrink-0 text-slate-400">{/\d/.test(li[1]) ? li[1] : "・"}</span>
              <span>{inline(li[2], key)}</span>
            </p>
          );
        return <p key={key}>{inline(line, key)}</p>;
      })}
    </div>
  );
}
