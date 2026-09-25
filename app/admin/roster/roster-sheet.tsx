import { roleLabel } from "@/lib/format";

export type RosterStaff = {
  id: string;
  name: string;
  furigana: string | null;
  birthdate: string | null;
  gender: string | null;
  phone: string | null;
  zipcode: string | null;
  address: string | null;
  emergency: string | null;
  mynumber: string | null;
  health_insurance_no: string | null;
  employment_insurance_no: string | null;
  basic_pension_no: string | null;
  welfare_pension_no: string | null;
  hire_date: string | null;
  role: string | null;
  department_name: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_type: string | null;
  bank_number: string | null;
  bank_holder: string | null;
  note: string | null;
  retirement_date: string | null;
  retirement_reason: string | null;
};

export const ROSTER_COLUMNS =
  "id, name, furigana, birthdate, gender, phone, zipcode, address, emergency, mynumber, health_insurance_no, employment_insurance_no, basic_pension_no, welfare_pension_no, hire_date, role, department_name, bank_name, bank_branch, bank_type, bank_number, bank_holder, note, retirement_date, retirement_reason";

const GENDER: Record<string, string> = { male: "男", female: "女", other: "その他" };

function wareki(iso: string | null) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00+09:00`);
  const seireki = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  const era = new Intl.DateTimeFormat("ja-JP-u-ca-japanese", { era: "long", year: "numeric", timeZone: "Asia/Tokyo" }).format(d);
  return `${seireki}（${era}）`;
}

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <table className="w-full table-fixed border-collapse text-[8pt]">
      <tbody>
        {rows.map(([th, td]) => (
          <tr key={th}>
            <th className="w-[34%] border border-slate-400 bg-slate-100 px-2 py-1.5 text-left font-bold whitespace-nowrap">{th}</th>
            <td className="border border-slate-400 px-2 py-1.5 break-all">{td}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <p className="mt-2.5 bg-slate-700 px-2.5 py-1 text-[8pt] font-bold text-white print:[-webkit-print-color-adjust:exact]">{children}</p>;
}

export function RosterSheet({ s, createdOn }: { s: RosterStaff; createdOn: string }) {
  return (
    <article className="mx-auto w-[182mm] bg-white text-[8.5pt] leading-snug text-slate-900 print:[-webkit-print-color-adjust:exact]">
      <header className="mb-4 border-b-2 border-slate-800 pb-3 text-center">
        <h2 className="text-[16pt] font-bold tracking-[0.3em]">労働者名簿</h2>
        <p className="mt-1 text-[9pt] text-slate-600">作成日：{createdOn}</p>
      </header>

      <div className="grid grid-cols-2 gap-[6mm]">
        <div>
          <Heading>基本情報</Heading>
          <Rows
            rows={[
              ["氏名", <span key="n" className="text-[11pt] font-bold">{s.name}</span>],
              ["フリガナ", s.furigana],
              ["生年月日", wareki(s.birthdate)],
              ["性別", s.gender ? GENDER[s.gender] ?? "" : ""],
              ["電話番号", s.phone],
            ]}
          />
          <Heading>住所</Heading>
          <Rows rows={[["郵便番号", s.zipcode], ["住所", s.address]]} />
          <Heading>緊急連絡先</Heading>
          <Rows rows={[["連絡先", s.emergency]]} />
          <Heading>社会保険・番号情報</Heading>
          <Rows
            rows={[
              ["マイナンバー", s.mynumber],
              ["健康保険番号", s.health_insurance_no],
              ["雇用保険番号", s.employment_insurance_no],
              ["基礎年金番号", s.basic_pension_no],
              ["厚生年金整理番号", s.welfare_pension_no],
            ]}
          />
        </div>
        <div>
          <Heading>雇用情報（従事する業務）</Heading>
          <Rows
            rows={[
              ["雇入年月日", wareki(s.hire_date)],
              ["所属部署", s.department_name],
              ["雇用区分", s.role ? roleLabel(s.role) : ""],
              ["役職", ""],
            ]}
          />
          <Heading>給与振込口座</Heading>
          <Rows
            rows={[
              ["銀行名", s.bank_name],
              ["支店名", s.bank_branch],
              ["口座種別", s.bank_type],
              ["口座番号", s.bank_number],
              ["口座名義", s.bank_holder],
            ]}
          />
          <Heading>履歴・備考</Heading>
          <div className="min-h-[14mm] border border-slate-400 px-2 py-1.5 text-[8pt] whitespace-pre-wrap">{s.note}</div>
        </div>
      </div>

      <Heading>退職・解雇（労働基準法施行規則 様式第19号）</Heading>
      <table className="w-full table-fixed border-collapse text-[8pt]">
        <tbody>
          <tr>
            <th className="w-[20%] border border-slate-400 bg-slate-100 px-2 py-2 font-bold">退職年月日</th>
            <td className="w-[30%] border border-slate-400 px-2 py-2">{wareki(s.retirement_date)}</td>
            <th className="w-[20%] border border-slate-400 bg-slate-100 px-2 py-2 font-bold">退職事由</th>
            <td className="border border-slate-400 px-2 py-2 break-all">{s.retirement_reason}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-3 flex justify-end">
        <div className="w-[55mm] border border-slate-400 px-4 py-2.5 text-center text-[8pt]">
          <p>確認者署名</p>
          <div className="my-1.5 h-[8mm] border-b border-slate-400" />
          <p className="text-left text-[7.5pt]">日付：</p>
        </div>
      </div>
    </article>
  );
}
