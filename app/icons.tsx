import type { AppIcon } from "@/lib/apps";

const PATHS: Record<AppIcon | "home" | "user", React.ReactNode> = {
  home: (
    <>
      <path d="M4 11l8-7 8 7M6 9.5V20h12V9.5" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20c1-4 4-6 7.5-6s6.5 2 7.5 6" />
    </>
  ),
  payslip: (
    <>
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M9 9h6M9 13h6M9 17h3" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l8-8M16 7l2 2M14 9l2 2" />
    </>
  ),
  yen: (
    <>
      <path d="M6 4l6 8 6-8M12 12v8M8 13h8M8 17h8" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" />
      <path d="M16 4.6a3.5 3.5 0 010 6.8M18.5 14.8c1.5.9 2.6 2.6 3 5.2" />
    </>
  ),
  book: (
    <>
      <path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z" />
      <path d="M5 17a3 3 0 013-3h11M9 8h6" />
    </>
  ),
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 102.5-6" />
      <path d="M3 4v4h4M12 8v4l3 2" />
    </>
  ),
  store: (
    <>
      <path d="M4 9l1.5-5h13L20 9M4 9h16v11H4z" />
      <path d="M10 20v-6h4v6" />
    </>
  ),
  login: (
    <>
      <path d="M14 4h5v16h-5M10 8l4 4-4 4M14 12H3" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V4M4 20h16" />
      <path d="M8 16v-5M12 16V8M16 16v-3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  crm: (
    <>
      <path d="M4 5h16v10H4zM9 19h6M12 15v4" />
      <path d="M7 12l3-3 2 2 4-4" />
    </>
  ),
};

export function Icon({ name, className = "size-5" }: { name: AppIcon | "home" | "user"; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {PATHS[name]}
    </svg>
  );
}
