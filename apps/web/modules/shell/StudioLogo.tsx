export function StudioLogo({ icon = false }: { icon?: boolean }) {
  return (
    <span role="img" aria-label="Fixmit" title="Fixmit" className="inline-flex items-center">
      <img
        src={icon ? "/api/logo?type=icon&brand=fixmit" : "/api/logo?brand=fixmit"}
        alt=""
        width={icon ? 36 : 150}
        height={icon ? 36 : 50}
        className={icon ? "rounded-lg" : "object-contain"}
      />
    </span>
  );
}
