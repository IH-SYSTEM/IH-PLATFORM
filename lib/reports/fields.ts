// 報告の入力欄。自由記述だけにせず、種類と制限を決めて受け取る（承認したら機械がそのまま反映できるように）
// 画面（クライアント）とサーバーの両方で使うので、サーバー専用のものは import しない

export type Field =
  | { key: string; label: string; kind: "staff"; hint?: string }
  | { key: string; label: string; kind: "date"; hint?: string }
  | { key: string; label: string; kind: "time"; hint?: string }
  | { key: string; label: string; kind: "select"; options: readonly string[]; hint?: string }
  | { key: string; label: string; kind: "minutes"; options: readonly number[]; hint?: string }
  | { key: string; label: string; kind: "text"; max: number; optional?: boolean; hint?: string };

export type Payload = Record<string, string | number>;

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
// 改行・タブ以外の制御文字は落とす
const clean = (v: string) => v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();

/** フォームの値を入力欄の定義どおりに読み取る。合わないものがあれば、その欄の名前つきでエラーを返す */
export function parsePayload(fields: readonly Field[], get: (key: string) => string | null): { payload: Payload } | { error: string } {
  const payload: Payload = {};
  for (const f of fields) {
    const raw = clean(get(f.key) ?? "");
    if (f.kind === "text") {
      if (!raw && !f.optional) return { error: `${f.label}を入力してください` };
      if (raw.length > f.max) return { error: `${f.label}は${f.max}文字以内で入力してください` };
      if (raw) payload[f.key] = raw;
      continue;
    }
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
    if (f.kind === "staff" && !/^[A-Za-z0-9_-]{1,64}$/.test(raw)) return { error: `${f.label}を選択してください` };
    payload[f.key] = raw;
  }
  return { payload };
}
