import type { LandingPage } from "@calcom/prisma/landingPage";

export function LandingSocialIcon({
  platform,
}: {
  platform: LandingPage["socialLinks"][number]["platform"];
}) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true">
      {platform === "instagram" && (
        <>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r=".8" fill="currentColor" />
        </>
      )}
      {platform === "youtube" && (
        <>
          <rect x="2" y="5" width="20" height="14" rx="4" />
          <path d="m10 9 5 3-5 3Z" fill="currentColor" />
        </>
      )}
      {platform === "tiktok" && <path d="M14 3v13a4 4 0 1 1-4-4M14 3c0 4 3 6 7 6" strokeWidth="3" />}
      {platform === "x" && (
        <>
          <path d="m4 3 13 18h3L7 3Z" />
          <path d="m20 3-7 8M4 21l7-8" />
        </>
      )}
      {platform === "linkedin" && (
        <>
          <circle cx="5" cy="5" r="1.5" fill="currentColor" />
          <path d="M5 9v12M10 21V9m0 5c0-6 9-6 9 0v7" strokeWidth="3" />
        </>
      )}
      {platform === "facebook" && (
        <path
          d="M14 22V12h4l1-4h-5V6c0-2 1-3 4-3V0c-6-1-8 2-8 6v2H7v4h3v10"
          fill="currentColor"
          stroke="none"
        />
      )}
    </svg>
  );
}
