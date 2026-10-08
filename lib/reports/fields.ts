// 報告の入力欄。自由記述だけにせず、種類と制限を決めて受け取る（承認したら機械がそのまま反映できるように）
// 画面（クライアント）とサーバーの両方で使うので、サーバー専用のものは import しない

export type Field =
  | { key: string; label: string; kind: "staff"; hint?: string }
  | { key: string; label: string; kind: "date"; hint?: string }
  | { key: string; label: string; kind: "time"; optional?: boolean; hint?: string }
  | { key: string; label: string; kind: "select"; options: readonly string[]; hint?: string }
  | { key: string; label: string; kind: "minutes"; options: readonly number[]; hint?: string }
  | { key: string; label: string; kind: "text"; max: number; optional?: boolean; hint?: string }
  | { key: string; label: string; kind: "longtext"; max: number; optional?: boolean; hint?: string }
  | { key: string; label: string; kind: "amount"; min: number; max: number; hint?: string } // 円。マイナスも可（レジの不足など）
  | { key: string; label: string; kind: "photo"; hint?: string }; // 写真（任意）。先に保存場所へ上げ、ファイルの番号を送る

export type Payload = Record<string, string | number>;

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// 改行・タブ以外の制御文字は落とす
const clean = (v: string) => v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();

/** フォームの値を入力欄の定義どおりに読み取る。合わないものがあれば、その欄の名前つきでエラーを返す */
export function parsePayload(fields: readonly Field[], get: (key: string) => string | null): { payload: Payload } | { error: string } {
  const payload: Payload = {};
  for (const f of fields) {
    const raw = clean(get(f.key) ?? "");
    if (f.kind === "text" || f.kind === "longtext") {
      if (!raw && !f.optional) return { error: `${f.label}を入力してください` };
      if (raw.length > f.max) return { error: `${f.label}は${f.max}文字以内で入力してください` };
      if (raw) payload[f.key] = raw;
      continue;
    }
    if (f.kind === "photo") {
      if (raw && !UUID.test(raw)) return { error: `${f.label}の写真をもう一度選んでください` };
      if (raw) payload[f.key] = raw;
      continue;
    }
    if (f.kind === "time" && f.optional && !raw) continue;
    if (!raw) return { error: `${f.label}を入力してください` };
    if (f.kind === "date" && !DATE.test(raw)) return { error: `${f.label}の形式が正しくありません` };
    if (f.kind === "time" && !TIME.test(raw)) return { error: `${f.label}は「19:30」の形式で入力してください` };
    if (f.kind === "select" && !f.options.includes(raw)) return { error: `${f.label}を選択肢から選んでください` };
    if (f.kind === "minutes") {
      const n = Number(raw);
      if (!f.options.includes(n)) return { error: `${f.label}を選択肢から選んでください` };
      payload[f.key] = n;
      continue;
    }
    if (f.kind === "amount") {
      const n = Number(raw.replace(/[,，円\s]/g, ""));
      if (!Number.isInteger(n) || n < f.min || n > f.max) return { error: `${f.label}は${f.min.toLocaleString()}〜${f.max.toLocaleString()}円の整数で入力してください` };
      payload[f.key] = n;
      continue;
    }
    if (f.kind === "staff" && !/^[A-Za-z0-9_-]{1,64}$/.test(raw)) return { error: `${f.label}を選択してください` };
    payload[f.key] = raw;
  }
  return { payload };
}

/** 一覧や詳細に出すための、入力欄ごとの表示（写真はファイルの番号のまま返す） */
export function describePayload(fields: readonly Field[], p: Payload, names: { staff?: (id: string) => string | undefined } = {}) {
  return fields
    .filter((f) => p[f.key] !== undefined && p[f.key] !== "")
    .map((f) => {
      const v = p[f.key];
      if (f.kind === "photo") return { label: f.label, value: String(v), photo: true };
      if (f.kind === "amount") return { label: f.label, value: `${Number(v) > 0 ? "+" : ""}${Number(v).toLocaleString()}円` };
      if (f.kind === "minutes") return { label: f.label, value: `${v}分` };
      if (f.kind === "staff") return { label: f.label, value: names.staff?.(String(v)) ?? String(v) };
      return { label: f.label, value: String(v) };
    });
}
