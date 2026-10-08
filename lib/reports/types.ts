import type { Field, Payload } from "./fields";

export type CategoryKey = "attendance" | "request" | "site" | "harassment";

// 報告窓口のカテゴリ。新しい種類の報告は、まずどのカテゴリに入るかを決める
export const CATEGORIES: Record<CategoryKey, { label: string; description: string }> = {
  attendance: { label: "勤怠", description: "携帯を忘れた・打刻を押し忘れたときの出勤・退勤" },
  request: { label: "申請・届け", description: "欠勤・遅刻・早退の届け、証明書の発行依頼" },
  site: { label: "現場からの報告", description: "事故・ヒヤリハット、設備の故障、レジの差異、クレーム、改善の提案" },
  harassment: { label: "相談窓口", description: "ハラスメントなどの相談。本部のごく限られた人だけが読みます" },
};

export type ApplyContext = {
  reportId: string;
  storeId: string | null;
  reporterId: string;
  reviewerId: string;
  payload: Payload;
};

/** 承認したときの処理で、反映できない理由があるときに投げる（画面にそのまま出す） */
export class ApplyError extends Error {}

/**
 * 報告の種類の定義。「それは報告窓口の一つにしましょう」と言われたら、ここに1つ足す。
 * 入力欄を変えたら version を上げる（昔の報告は昔の版のまま読める）
 */
export type ReportType = {
  key: string;
  version: number;
  category: CategoryKey;
  title: string;
  description: string;
  fields: readonly Field[];
  /** 対象スタッフの入力欄。報告者本人を選べないようにする（証人が本人以外であること） */
  subjectField?: string;
  /** 店舗の打刻範囲内でだけ受け付ける（報告者がその場にいたことの担保） */
  onSiteOnly: boolean;
  /** 本部の画面で報告者の名前を出さない（目安箱で「匿名」を選んだときなど。記録には残る） */
  anonymous?: (p: Payload) => boolean;
  /** 本部の受付で読める人を、特別管理者だけにする（ハラスメント相談） */
  superadminOnly?: boolean;
  /** 本部の［承認］ボタンの文言（記録するだけの報告は「確認済みにする」など） */
  approveLabel?: string;
  /** 一覧に出す1行の要約 */
  summary: (p: Payload, names: { subject?: string }) => string;
  /** 報告の内容の時刻。報告した時刻と離れていれば「事後報告」の印を付ける */
  reportedAt?: (p: Payload) => string | null;
  /** 承認したときの処理。反映したものを返す */
  apply: (ctx: ApplyContext) => Promise<Record<string, unknown>>;
};
