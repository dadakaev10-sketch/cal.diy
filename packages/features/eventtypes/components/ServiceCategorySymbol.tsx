import { isCustomServiceCategoryIcon, isServiceCategoryIcon } from "@calcom/prisma/serviceCatalog";
import { Icon } from "@calcom/ui/components/icon";

export function ServiceCategorySymbol({
  symbol,
  className = "h-6 w-6",
}: {
  symbol: string;
  className?: string;
}) {
  if (isCustomServiceCategoryIcon(symbol)) {
    const mask = `url("/category-symbols/${symbol}.svg") center / contain no-repeat`;
    return (
      <span
        aria-hidden
        className={`inline-block shrink-0 ${className}`}
        style={{ backgroundColor: "currentColor", mask, WebkitMask: mask }}
      />
    );
  }
  if (isServiceCategoryIcon(symbol) && !isCustomServiceCategoryIcon(symbol)) {
    return <Icon name={symbol} className={className} />;
  }
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center text-2xl leading-none ${className}`}>
      {symbol}
    </span>
  );
}
