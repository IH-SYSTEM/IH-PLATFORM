import "server-only";
import { checkInReport, checkOutReport } from "./attendance-types";
import {
  absenceNotice,
  accidentReport,
  certificateRequest,
  complaintReport,
  harassmentReport,
  registerReport,
  repairReport,
  suggestionReport,
} from "./site-types";
import type { ReportType } from "./types";

// 報告窓口で受け付ける種類の一覧。新しい種類はここに足す（並び順＝画面に出る順）
export const REPORT_TYPES: ReportType[] = [
  checkInReport,
  checkOutReport,
  absenceNotice,
  certificateRequest,
  accidentReport,
  repairReport,
  registerReport,
  complaintReport,
  suggestionReport,
  harassmentReport,
];

export const reportType = (key: string) => REPORT_TYPES.find((t) => t.key === key) ?? null;
