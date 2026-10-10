import process from "node:process";
import { getTranslation } from "@calcom/i18n/server";
import {
  billingEnabled,
  billingOffer,
  hasBillingAccess,
  paypalConfig,
  readBilling,
  requiresBilling,
  syncBilling,
} from "@lib/fixmitBilling";
import { billingUser } from "@lib/fixmitBillingAuth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";
import styles from "../../modules/auth/studio-auth.module.css";
import PayPalCheckout from "./paypal-checkout";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fixmit Abo", robots: { index: false, follow: false } };
export default async function BillingPage() {
  const user = await billingUser(
    new NextRequest(new URL("/billing", process.env.NEXTAUTH_URL), { headers: await headers() })
  );
  if (!user) redirect("/auth/login?callbackUrl=%2Fbilling");
  const t = await getTranslation(user.locale, "common");
  const grandfathered = billingEnabled() && !(await requiresBilling(user.id));
  let active = grandfathered;
  let canCheckout = false;
  let clientId = "";
  let status = "";
  let isTest = false;
  if (billingEnabled() && !grandfathered) {
    try {
      clientId = paypalConfig().clientId;
      isTest = (await billingOffer(user.id)).isTest;
      const stored = await readBilling(user.id);
      const row = stored?.subscriptionId ? await syncBilling(user.id) : stored;
      active = hasBillingAccess(row);
      status = row?.status || "NEW";
      canCheckout = ["NEW", "APPROVAL_PENDING"].includes(status);
    } catch {
      status = "UNAVAILABLE";
    }
  }
  const labels = Object.fromEntries(
    ["fixmit_billing_pending", "fixmit_billing_error", "fixmit_billing_check"].map((key) => [key, t(key)])
  );
  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <a className={styles.brand} href="/">
          Fixmit
        </a>
        <h1>{t("fixmit_billing_title")}</h1>
        <p>
          {t(
            grandfathered
              ? "fixmit_billing_existing"
              : isTest
                ? "fixmit_billing_test_price"
                : "fixmit_billing_price"
          )}
        </p>
        {!grandfathered && <p>{t("fixmit_billing_terms")}</p>}
        {active ? (
          <>
            <p role="status">{t("fixmit_billing_active")}</p>
            <a className={styles.primary} href="/event-types">
              {t("fixmit_billing_continue")}
            </a>
          </>
        ) : null}
        {!active && canCheckout ? <PayPalCheckout clientId={clientId} labels={labels} /> : null}
        {!active && !canCheckout && (
          <p role="status">
            {t(
              status === "UNAVAILABLE" || !billingEnabled()
                ? "fixmit_billing_unavailable"
                : "fixmit_billing_inactive"
            )}
          </p>
        )}
        <a
          className={styles.secondary}
          href={
            process.env.PAYPAL_ENVIRONMENT === "sandbox"
              ? "https://www.sandbox.paypal.com/myaccount/autopay/"
              : "https://www.paypal.com/myaccount/autopay/"
          }>
          {t("fixmit_billing_manage")}
        </a>
        <a className={styles.secondary} href="/auth/logout">
          {t("sign_out")}
        </a>
      </section>
    </main>
  );
}
