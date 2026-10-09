import "server-only";
import type { ReportType } from "./types";

// 記録するだけの報告（承認で勤怠などを書き換えない）。本部が中身を確認したら「確認済み」にする
const recordOnly = async () => ({ recorded: true });
const DETAIL = { key: "detail", label: "くわしい内容", kind: "longtext", max: 500 } as const;
const PHOTO = { key: "photo", label: "写真", kind: "photo", hint: "あれば添えてください（任意）" } as const;
const DATE = { key: "date", label: "日付", kind: "date" } as const;
const TIME = { key: "time", label: "時刻", kind: "time", optional: true } as const;

// ===== 現場からの報告 =====
export const accidentReport: ReportType = {
  key: "site.accident",
  version: 1,
  category: "site",
  title: "事故・ヒヤリハット",
  description: "けが・事故、または事故になりかけた出来事",
  fields: [
    { key: "kind", label: "種類", kind: "select", options: ["事故（けが・破損あり）", "ヒヤリハット（事故になりかけた）"] },
    DATE,
    TIME,
    { key: "place", label: "場所", kind: "text", max: 50, hint: "例：キッチンの揚げ場、入口の階段" },
    { key: "injury", label: "けが人", kind: "select", options: ["なし", "あり（スタッフ）", "あり（お客様）"] },
    DETAIL,
    PHOTO,
  ],
  onSiteOnly: false,
  approveLabel: "確認済みにする",
  summary: (p) => `${p.kind} ${p.date}${p.time ? ` ${p.time}` : ""} ${p.place}（けが人：${p.injury}）`,
  apply: recordOnly,
};

export const repairReport: ReportType = {
  key: "site.repair",
  version: 1,
  category: "site",
  title: "設備の故障・修理依頼",
  description: "冷蔵庫・エアコン・レジ・照明などの故障や不具合",
  fields: [
    { key: "equipment", label: "設備", kind: "text", max: 50, hint: "例：生ビールのサーバー、2番テーブルの照明" },
    { key: "urgency", label: "急ぎ具合", kind: "select", options: ["すぐ対応が必要（営業に影響）", "今週中に", "急がない"] },
    DETAIL,
    PHOTO,
  ],
  onSiteOnly: false,
  approveLabel: "受け付けた",
  summary: (p) => `${p.equipment}（${p.urgency}）`,
  apply: recordOnly,
};

export const registerReport: ReportType = {
  key: "site.register",
  version: 1,
  category: "site",
  title: "レジの差異",
  description: "締めのときの現金が、レジの記録と合わなかった",
  fields: [
    DATE,
    { key: "amount", label: "差額", kind: "amount", min: -1_000_000, max: 1_000_000, hint: "多いときはプラス、足りないときはマイナス（例：-1000）" },
    { key: "cause", label: "考えられる原因", kind: "select", options: ["お釣りの間違い", "レジの打ち間違い", "分からない", "その他"] },
    { ...DETAIL, optional: true },
  ],
  onSiteOnly: false,
  approveLabel: "確認済みにする",
  summary: (p) => `${p.date} 差額 ${Number(p.amount) > 0 ? "+" : ""}${Number(p.amount).toLocaleString()}円（${p.cause}）`,
  apply: recordOnly,
};

export const complaintReport: ReportType = {
  key: "site.complaint",
  version: 1,
  category: "site",
  title: "クレーム",
  description: "お客様からの苦情・ご指摘",
  fields: [
    DATE,
    TIME,
    { key: "kind", label: "内容の種類", kind: "select", options: ["料理・商品", "接客", "待ち時間", "会計", "設備・清潔さ", "その他"] },
    DETAIL,
    { key: "status", label: "対応", kind: "select", options: ["その場で対応済み", "まだ対応できていない（本部に相談したい）"] },
    PHOTO,
  ],
  onSiteOnly: false,
  approveLabel: "確認済みにする",
  summary: (p) => `${p.date} ${p.kind}（${p.status}）`,
  apply: recordOnly,
};

export const suggestionReport: ReportType = {
  key: "site.suggestion",
  version: 1,
  category: "site",
  title: "目安箱（改善の提案）",
  description: "仕事のやり方・お客様へのサービス・働く環境をよくするアイデア",
  fields: [
    { key: "theme", label: "テーマ", kind: "select", options: ["仕事のやり方", "お客様へのサービス", "働く環境", "その他"] },
    DETAIL,
    { key: "name", label: "名前の扱い", kind: "select", options: ["名前を出してよい", "匿名にする"], hint: "匿名にすると、本部の画面に名前が出ません" },
  ],
  onSiteOnly: false,
  anonymous: (p) => p.name === "匿名にする",
  approveLabel: "読みました",
  summary: (p) => `${p.theme}`,
  apply: recordOnly,
};

// ===== 相談窓口（本部の特別管理者だけが読む） =====
export const harassmentReport: ReportType = {
  key: "harassment.consult",
  version: 1,
  category: "harassment",
  title: "ハラスメントの相談",
  description: "パワハラ・セクハラなど、職場での困りごとの相談。本部のごく限られた人だけが読みます",
  fields: [
    { key: "kind", label: "相談の種類", kind: "select", options: ["パワーハラスメント", "セクシュアルハラスメント", "その他の困りごと"] },
    { key: "when", label: "いつごろ", kind: "text", max: 50, optional: true, hint: "例：10月に入ってから、毎週土曜" },
    DETAIL,
    { key: "contact", label: "本部からの連絡", kind: "select", options: ["LINEで連絡してほしい", "連絡はいらない（記録だけ）"] },
  ],
  onSiteOnly: false,
  superadminOnly: true,
  approveLabel: "受け付けた",
  summary: (p) => `${p.kind}（${p.contact}）`,
  apply: recordOnly,
};

// ===== 申請・届け =====
export const absenceNotice: ReportType = {
  key: "request.absence",
  version: 1,
  category: "request",
  title: "欠勤・遅刻・早退の届け",
  description: "休む・遅れる・早く帰るときに、理由を本部に届けます（勤怠の時刻は打刻のまま）",
  fields: [
    { key: "kind", label: "届けの種類", kind: "select", options: ["欠勤", "遅刻", "早退"] },
    DATE,
    { key: "time", label: "出勤・退勤の予定時刻", kind: "time", optional: true, hint: "遅刻は着く時刻、早退は帰る時刻" },
    { key: "reason", label: "理由", kind: "select", options: ["体調不良", "家庭の事情", "交通機関の遅れ", "その他"] },
    { key: "note", label: "メモ", kind: "text", max: 100, optional: true },
  ],
  onSiteOnly: false,
  approveLabel: "受理する",
  summary: (p) => `${p.kind} ${p.date}${p.time ? ` ${p.time}` : ""}（${p.reason}）`,
  apply: recordOnly,
};

export const certificateRequest: ReportType = {
  key: "request.certificate",
  version: 1,
  category: "request",
  title: "証明書の発行依頼",
  description: "在職証明書・給与証明書（所得証明）などの発行",
  fields: [
    { key: "kind", label: "証明書の種類", kind: "select", options: ["在職証明書", "給与証明書（所得証明）", "その他"] },
    { key: "purpose", label: "使い道", kind: "text", max: 50, hint: "例：賃貸の契約、保育園の申し込み" },
    { key: "copies", label: "部数", kind: "select", options: ["1部", "2部", "3部"] },
    { key: "due", label: "いつまでに必要か", kind: "date" },
    { key: "note", label: "メモ", kind: "text", max: 100, optional: true },
  ],
  onSiteOnly: false,
  approveLabel: "承認して発行する",
  summary: (p) => `${p.kind} ${p.copies}（${p.due}までに・${p.purpose}）`,
  // 在職証明書・給与証明書は PDF を作って本人の「書類」に入れる。「その他」は受け付けだけ（本部が作って書類に入れる）
  apply: async (ctx) => {
    const kind = String(ctx.payload.kind ?? "");
    if (kind !== "在職証明書" && kind !== "給与証明書（所得証明）") return { recorded: true, notice: "受け付けました。本部で用意して、書類に入れます" };
    const { issueCertificate } = await import("@/lib/certificate");
    const r = await issueCertificate({ staffId: ctx.reporterId, kind, purpose: String(ctx.payload.purpose ?? ""), copies: Number(String(ctx.payload.copies ?? "1").replace(/\D/g, "")) || 1, issuedBy: ctx.reviewerId });
    return { fileId: r.fileId, notice: `${kind}を発行しました。マイページの「書類」から開いて、印刷してください（社印が必要なら本部へ）` };
  },
};

// AI取説で答えられないことや、担当の判断が要る質問の受け皿（2026-10-10 黒田さん要望「難題は部署に振る」）
export const inquiryRequest: ReportType = {
  key: "request.inquiry",
  version: 1,
  category: "request",
  title: "本部への問い合わせ",
  description: "給与・税金・手続き・システムの困りごとなど、担当に聞きたいこと",
  fields: [
    { key: "to", label: "宛先", kind: "select", options: ["経理（給与・税金・社会保険）", "総務（契約・手続き・休み）", "システム（使い方・不具合）", "店長（シフト・お店のこと）"] },
    { key: "subject", label: "件名", kind: "text", max: 50, hint: "例：10月の明細の深夜手当について" },
    { key: "detail", label: "くわしい内容", kind: "longtext", max: 500 },
  ],
  onSiteOnly: false,
  approveLabel: "回答した（本人に伝えた）",
  summary: (p) => `【${String(p.to ?? "").split("（")[0]}】${p.subject}`,
  apply: async () => ({ recorded: true, notice: "問い合わせに回答しました。くわしくは担当から連絡があります" }),
};
