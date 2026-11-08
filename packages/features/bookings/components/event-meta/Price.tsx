import dynamic from "next/dynamic";

import { formatPrice } from "@calcom/lib/currencyConversions";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { EventPrice } from "@calcom/features/bookings/types";

const AlbyPriceComponent = dynamic(
  () => import("@calcom/app-store/alby/components/AlbyPriceComponent").then((m) => m.AlbyPriceComponent),
  {
    ssr: false,
  }
);

export const Price = ({ price, currency, displayAlternateSymbol = true }: EventPrice) => {
  const { i18n } = useLocale();
  if (price === 0) return null;

  const formattedPrice = formatPrice(price, currency, i18n.language);

  return currency !== "BTC" ? (
    <>{formattedPrice}</>
  ) : (
    <AlbyPriceComponent
      displaySymbol={displayAlternateSymbol}
      price={price}
      formattedPrice={formattedPrice}
    />
  );
};
