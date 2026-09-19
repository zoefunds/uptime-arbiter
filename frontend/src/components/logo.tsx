export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden>
      <rect width="48" height="48" rx="12" fill="#0F172A" />
      <rect x="1" y="1" width="46" height="46" rx="11" stroke="#06B6D4" strokeOpacity="0.35" strokeWidth="1.5" />
      <path
        d="M14 28V20C14 16.6863 16.6863 14 20 14H28C31.3137 14 34 16.6863 34 20V28"
        stroke="#38BDF8"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M10 24H16L19 18L23 30L27 21L30 26L32 24H38"
        stroke="#06B6D4"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="33" r="3" fill="#10B981" />
      <circle cx="24" cy="33" r="5" stroke="#10B981" strokeOpacity="0.4" strokeWidth="1.5" />
    </svg>
  );
}
