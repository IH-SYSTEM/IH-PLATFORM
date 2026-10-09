// 画面を移るとき、中身が届くまでの間にすぐ出す仮の表示（押した手応えをすぐ返す）
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="読み込み中">
      <div className="h-8 w-48 rounded bg-slate-200" />
      <div className="h-24 rounded-md bg-slate-100" />
      <div className="h-24 rounded-md bg-slate-100" />
      <div className="h-24 rounded-md bg-slate-100" />
    </div>
  );
}
