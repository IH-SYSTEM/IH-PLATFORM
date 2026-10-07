import { FILE_CATEGORIES, formatBytes, type FileRow } from "@/lib/files";
import { DeleteFileButton } from "./delete-file-button";

const when = (iso: string) => new Date(iso).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric" });

/** 書類の一覧。開くときは /files/[id] を通す（権限確認と操作ログ） */
export function FileList({ files, canDelete = false, showVisibility = false }: { files: FileRow[]; canDelete?: boolean; showVisibility?: boolean }) {
  if (!files.length) return <p className="text-sm text-slate-400">書類はまだありません</p>;
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {files.map((f) => (
        <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{FILE_CATEGORIES[f.category as keyof typeof FILE_CATEGORIES]?.label ?? f.category}</span>
          <a href={`/files/${f.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium text-brand hover:underline">
            {f.name}
          </a>
          <span className="text-xs text-slate-400">
            {formatBytes(f.size_bytes)}・{when(f.created_at)}
            {showVisibility && (f.visible_to_owner ? "・本人に表示" : "・本人には非表示")}
          </span>
          {canDelete && <DeleteFileButton fileId={f.id} name={f.name} />}
        </li>
      ))}
    </ul>
  );
}
