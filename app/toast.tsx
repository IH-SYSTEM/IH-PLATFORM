// 画面下部に重ねて表示し、数秒で自動的に消える通知。key を変えると再表示される
export function Toast({ message, tone = "success" }: { message: string; tone?: "success" | "error" }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`toast pointer-events-none fixed inset-x-0 bottom-20 z-50 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-lg ${
        tone === "success" ? "bg-emerald-600" : "bg-rose-600"
      }`}
    >
      {tone === "success" ? "✓ " : "⚠ "}
      {message}
    </div>
  );
}
