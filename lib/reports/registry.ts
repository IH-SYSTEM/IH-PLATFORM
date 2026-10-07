import "server-only";
import { checkInReport, checkOutReport } from "./attendance-types";
import type { ReportType } from "./types";

// 報告窓口で受け付ける種類の一覧。新しい種類はここに足す
export const REPORT_TYPES: ReportType[] = [checkInReport, checkOutReport];

export const reportType = (key: string) => REPORT_TYPES.find((t) => t.key === key) ?? null;
