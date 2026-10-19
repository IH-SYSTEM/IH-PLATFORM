import "server-only";
import { checkInReport, checkOutReport, fixOtherReport, fixSelfReport } from "./attendance-types";
import {
  absenceNotice,
  accidentReport,
  certificateRequest,
  complaintReport,
  harassmentReport,
  inquiryRequest,
  registerReport,
  repairReport,
  suggestionReport,
  expenseReport,
} from "./site-types";
import type { ReportType } from "./types";

// 報告窓口で受け付ける種類の一覧。新しい種類はここに足す（並び順＝画面に出る順）
export const REPORT_TYPES: ReportType[] = [
  fixSelfReport,
  fixOtherReport,
  checkInReport,
  checkOutReport,
  absenceNotice,
  certificateRequest,
  inquiryRequest,
  accidentReport,
  repairReport,
  registerReport,
  complaintReport,
  suggestionReport,
  expenseReport,
  harassmentReport,
];

export const reportType = (key: string) => REPORT_TYPES.find((t) => t.key === key) ?? null;
