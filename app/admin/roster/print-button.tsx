"use client";

export function PrintButton({ label = "印刷・PDF保存" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
    >
      {label}
    </button>
  );
}
