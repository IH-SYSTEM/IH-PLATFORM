// export-firestore.mjs のバックアップを Supabase に投入する
// 使い方: node --env-file=.env.local scripts/import-to-supabase.mjs backups/xxx.json [--apply]
// --apply なしは検証のみ（DBに書き込まない）
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const [file, flag] = process.argv.slice(2);
const apply = flag === "--apply";
if (!file) throw new Error("バックアップJSONのパスを指定してください");
const { docs, exportedAt, authUsers = [] } = JSON.parse(readFileSync(file, "utf8"));
const authCreatedAt = new Map(authUsers.map((u) => [u.uid, u.createdAt ? new Date(u.createdAt).toISOString() : null]));

const issues = [];
const warn = (msg) => issues.push(msg);

const ts = (v) => (v && typeof v === "object" && v.__ts ? v.__ts : null);
const date = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const str = (v) => (v === undefined || v === null || v === "" ? null : String(v));
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const bool = (v, d = false) => (typeof v === "boolean" ? v : d);

const top = {};
const legacy = [];
for (const [path, data] of Object.entries(docs)) {
  const parts = path.split("/");
  const col = parts[0];
  if (parts.length === 2 && ["stores", "staff", "salary"].includes(col)) {
    (top[col] ??= []).push({ id: parts[1], data });
  } else {
    legacy.push({ path, collection: parts.filter((_, i) => i % 2 === 0).join("/"), data });
  }
}

// ===== stores =====
const stores = (top.stores ?? []).map(({ id, data: d }) => ({
  id,
  name: str(d.name) ?? `(名称なし ${id})`,
  address: str(d.address),
  lat: num(d.location?.lat) ?? d.location?.__geo?.lat ?? null,
  lng: num(d.location?.lng) ?? d.location?.__geo?.lng ?? null,
  open_time: str(d.operatingHours?.open),
  close_time: str(d.operatingHours?.close),
  scheduled_clock_out: str(d.scheduledClockOut),
  notification_delay_min: num(d.notificationDelayMin),
  geofence_enabled: bool(d.geofenceEnabled),
  geofence_radius: num(d.geofenceRadius),
  wifi_enabled: bool(d.wifiEnabled),
  allowed_ips: Array.isArray(d.allowedIPs) ? d.allowedIPs.map(String) : [],
  target_labor_cost_rate: num(d.targetLaborCostRate),
  rosai_rate: num(d.rosaiRate),
  monthly_holidays: num(d.monthlyHolidays),
  default_paid_leave: num(d.defaultPaidLeave),
  sort_order: num(d.order),
  manager_staff_ids: Array.isArray(d.managers) ? d.managers.map(String) : [],
  is_active: d.isActive !== false,
  created_by: str(d.createdBy),
  updated_by: str(d.updatedBy),
  created_at: ts(d.createdAt) ?? exportedAt,
  updated_at: ts(d.updatedAt) ?? ts(d.createdAt) ?? exportedAt,
  firestore_raw: d,
}));
const storeByName = new Map();
for (const s of stores) {
  if (storeByName.has(s.name)) warn(`店舗名が重複: "${s.name}" (${storeByName.get(s.name)} / ${s.id})`);
  else storeByName.set(s.name, s.id);
}

// ===== staff =====
const seenUid = new Set();
const seenLine = new Set();
const staff = (top.staff ?? []).map(({ id, data: d }) => {
  let firebaseUid = str(d.uid) ?? id;
  if (seenUid.has(firebaseUid)) { warn(`uid重複: staff/${id} (${firebaseUid}) → firebase_uid を空にして投入`); firebaseUid = null; }
  else seenUid.add(firebaseUid);
  let lineUserId = str(d.lineUserId);
  if (lineUserId && seenLine.has(lineUserId)) { warn(`LINE ID重複: staff/${id} → line_user_id を空にして投入`); lineUserId = null; }
  else if (lineUserId) seenLine.add(lineUserId);

  const dept = str(d.department);
  const storeId = dept ? storeByName.get(dept) ?? null : null;
  if (dept && !storeId) warn(`店舗に一致しない所属: staff/${id} ${d.name} → "${dept}"（department_name に保持）`);
  for (const [k, v] of Object.entries({ hireDate: d.hireDate, birthdate: d.birthdate, retirementDate: d.retirementDate })) {
    if (v && !date(v)) warn(`日付形式が不正: staff/${id} ${k}="${v}"（firestore_raw に保持）`);
  }
  return {
    id,
    firebase_uid: firebaseUid,
    email: str(d.email),
    name: str(d.name) ?? `(氏名なし ${id})`,
    furigana: str(d.furigana),
    employee_no: str(d.employeeNo),
    role: str(d.role),
    permission: str(d.permission),
    modules: d.modules && typeof d.modules === "object" ? d.modules : {},
    scope: d.scope ?? null,
    store_id: storeId,
    department_name: dept,
    hire_date: date(d.hireDate),
    birthdate: date(d.birthdate),
    gender: str(d.gender),
    phone: str(d.phone),
    zipcode: str(d.zipcode),
    address: str(d.address),
    emergency: str(d.emergency),
    note: str(d.note),
    bank_name: str(d.bankName),
    bank_branch: str(d.bankBranch),
    bank_type: str(d.bankType),
    bank_number: str(d.bankNumber),
    bank_holder: str(d.bankHolder),
    mynumber: str(d.mynumber),
    health_insurance_no: str(d.healthInsuranceNo),
    employment_insurance_no: str(d.employmentInsuranceNo),
    basic_pension_no: str(d.basicPensionNo),
    welfare_pension_no: str(d.welfarePensionNo),
    line_added: bool(d.lineAdded),
    line_user_id: lineUserId,
    line_connected_at: ts(d.lineConnectedAt),
    retired: bool(d.retired),
    retirement_date: date(d.retirementDate),
    retirement_reason: str(d.retirementReason),
    is_active: typeof d.isActive === "boolean" ? d.isActive : null,
    first_login: bool(d.firstLogin),
    primary_store_id: str(d.primaryStoreId),
    payroll_master: d.payrollMaster ?? null,
    attachments: Array.isArray(d.attachments) ? d.attachments : [],
    permission_updated_at: ts(d.permissionUpdatedAt),
    permission_updated_by: str(d.permissionUpdatedBy),
    created_by: str(d.createdBy),
    updated_by: str(d.updatedBy),
    created_at: ts(d.createdAt) ?? authCreatedAt.get(str(d.uid) ?? id) ?? exportedAt,
    updated_at: ts(d.updatedAt) ?? ts(d.createdAt) ?? authCreatedAt.get(str(d.uid) ?? id) ?? exportedAt,
    firestore_raw: d,
  };
});
const staffIds = new Set(staff.map((s) => s.id));
const staffIdByUid = new Map(staff.filter((s) => s.firebase_uid).map((s) => [s.firebase_uid, s.id]));

// ===== salary =====
const salary = [];
const periodCount = new Map();
for (const { id, data: d } of top.salary ?? []) {
  const staffId = staffIds.has(d.staffId) ? d.staffId : staffIdByUid.get(d.staffId);
  if (!staffId || !Number.isInteger(d.year) || !Number.isInteger(d.month)) {
    warn(`給与を紐付けできず退避: salary/${id} staffId=${d.staffId} ${d.year}/${d.month} → firestore_legacy`);
    legacy.push({ path: `salary/${id}`, collection: "salary", data: d });
    continue;
  }
  const key = `${staffId} ${d.year}-${d.month}`;
  periodCount.set(key, (periodCount.get(key) ?? 0) + 1);
  salary.push({
    firestore_id: id,
    staff_id: staffId,
    staff_name: str(d.staffName),
    year: d.year,
    month: d.month,
    employment_type: str(d.employmentType),
    attendance: d.attendance ?? {},
    payment: d.payment ?? {},
    deduction: d.deduction ?? {},
    total_payment: num(d.totalPayment) ?? 0,
    total_deduction: num(d.totalDeduction) ?? 0,
    net_payment: num(d.netPayment) ?? 0,
    memo: str(d.memo),
    status: d.status === "confirmed" ? "confirmed" : "draft",
    created_at: ts(d.createdAt) ?? ts(d.updatedAt) ?? exportedAt,
    updated_at: ts(d.updatedAt) ?? ts(d.createdAt) ?? exportedAt,
    firestore_raw: d,
  });
}
for (const [key, n] of periodCount) if (n > 1) warn(`同じ月の給与が${n}件: ${key}（全件投入、一意制約は後で判断）`);

console.log(`stores: ${stores.length} / staff: ${staff.length} / salary: ${salary.length} / legacy: ${legacy.length}`);
console.log(`\n確認事項 ${issues.length} 件`);
for (const i of issues) console.log(" - " + i);

if (!apply) {
  console.log("\n（検証のみ。書き込むには --apply を付けて再実行）");
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error(".env.local に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です");
const sb = createClient(url, key, { auth: { persistSession: false } });

async function upsert(table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from(table).upsert(rows.slice(i, i + 200), { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  console.log(`✔ ${table}: ${rows.length}`);
}
await upsert("stores", stores, "id");
await upsert("staff", staff, "id");
await upsert("salary_records", salary, "firestore_id");
await upsert("firestore_legacy", legacy, "path");
console.log("完了");
