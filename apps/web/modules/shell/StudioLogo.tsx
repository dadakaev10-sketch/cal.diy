export function StudioLogo({ icon = false }: { icon?: boolean }) {
  return (
    <span role="img" aria-label="Fixmit" title="Fixmit" className="text-emphasis inline-flex items-center">
      {icon ? (
        <span
          aria-hidden="true"
          className="border-subtle mx-auto flex h-9 w-9 items-center justify-center rounded-lg border text-lg font-semibold">
          <svg width="25" height="25" viewBox="0 0 256 256" fill="none" aria-hidden="true">
            <path
              d="m58 130 47 47 93-98"
              stroke="currentColor"
              strokeWidth="30"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="m150 79 48 0 0 48"
              stroke="currentColor"
              strokeWidth="22"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      ) : (
        <span aria-hidden="true" className="flex flex-col gap-1 leading-none">
          <span className="text-sm font-semibold tracking-wide">Fixmit</span>
        </span>
      )}
    </span>
  );
}
