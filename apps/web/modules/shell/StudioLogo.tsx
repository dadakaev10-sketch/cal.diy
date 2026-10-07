export function StudioLogo({ icon = false }: { icon?: boolean }) {
  return (
    <span role="img" aria-label="Fixmit" title="Fixmit" className="text-emphasis inline-flex items-center">
      {icon ? (
        <span
          aria-hidden="true"
          className="border-subtle mx-auto flex h-9 w-9 items-center justify-center rounded-lg border text-lg font-semibold">
          F
        </span>
      ) : (
        <span aria-hidden="true" className="flex flex-col gap-1 leading-none">
          <span className="text-sm font-semibold tracking-wide">Fixmit</span>
        </span>
      )}
    </span>
  );
}
