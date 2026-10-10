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
import { activePass } from "@lib/fixmitPass";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";
import styles from "../../modules/auth/studio-auth.module.css";
import OneTimeCheckout from "./one-time-checkout";
import PayPalCheckout from "./paypal-checkout";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fixmit Zugang", robots: { index: false, follow: false } };
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ purchase?: string }>;
}) {
  const oneTime = (await searchParams).purchase === "one-time";
  const user = await billingUser(
    new NextRequest(new URL("/billing", process.env.NEXTAUTH_URL), { headers: await headers() })
  );
  if (!user) redirect("/auth/login?callbackUrl=%2Fbilling");
  const t = await getTranslation(user.locale, "common");
  const isFree = !billingEnabled();
  const grandfathered = billingEnabled() && !(await requiresBilling(user.id));
  let active = isFree || grandfathered;
  let canCheckout = false;
  let clientId = "";
  let status = "";
  let isTest = false;
  let hasSubscription = false;
  let passUntil: Date | null = null;
  if (billingEnabled() && !grandfathered) {
    try {
      clientId = paypalConfig().clientId;
      isTest = billingOffer().isTest;
      const stored = await readBilling(user.id);
      const pass = await activePass(user.id);
      hasSubscription = !!stored?.subscriptionId;
      const row = !pass && stored?.subscriptionId ? await syncBilling(user.id) : stored;
      passUntil = pass?.accessUntil || null;
      active = hasBillingAccess(row) || !!pass;
      status = row?.status || "NEW";
      canCheckout = oneTime || ["NEW", "APPROVAL_PENDING"].includes(status);
    } catch {
      status = "UNAVAILABLE";
    }
  }
  if (isFree) hasSubscription = !!(await readBilling(user.id))?.subscriptionId;
  const labels = Object.fromEntries(
    [
      "fixmit_billing_pending",
      "fixmit_billing_error",
      "fixmit_billing_check",
      "fixmit_pass_card_notice",
      "fixmit_pass_cancelled",
    ].map((key) => [key, t(key)])
  );
  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <a className={styles.brand} href="/">
          Fixmit
        </a>
        <h1>{t("fixmit_access_title")}</h1>
        <p>
          {t(
            isFree
              ? "public_free_terms"
              : grandfathered
                ? "fixmit_billing_existing"
                : oneTime || !!passUntil
                  ? "fixmit_pass_price"
                  : isTest
                    ? "fixmit_billing_test_price"
                    : "fixmit_billing_price"
          )}
        </p>
        {!grandfathered && !active && (
          <nav style={{ display: "flex", gap: 16, marginBottom: 20 }}>
            <a
              href="/billing"
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: !oneTime ? "#dce8df" : "#f4f6f3",
                fontWeight: !oneTime ? 700 : 400,
              }}
              aria-current={!oneTime ? "page" : undefined}>
              {t("fixmit_subscription_option")}
            </a>
            <a
              href="/billing?purchase=one-time"
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: oneTime ? "#dce8df" : "#f4f6f3",
                fontWeight: oneTime ? 700 : 400,
              }}
              aria-current={oneTime ? "page" : undefined}>
              {t("fixmit_pass_option")}
            </a>
          </nav>
        )}
        {!grandfathered && !active && <p>{t(oneTime ? "fixmit_pass_terms" : "fixmit_billing_terms")}</p>}
        {passUntil && (
          <p>
            {t("fixmit_pass_until", {
              date: new Intl.DateTimeFormat(user.locale || "de", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "UTC",
              }).format(passUntil),
            })}
          </p>
        )}
        {active ? (
          <>
            <p role="status">{t("fixmit_billing_active")}</p>
            <a className={styles.primary} href="/event-types">
              {t("fixmit_billing_continue")}
            </a>
          </>
        ) : null}
        {!active && canCheckout ? (
          oneTime ? (
            <OneTimeCheckout clientId={clientId} labels={labels} />
          ) : (
            <PayPalCheckout clientId={clientId} labels={labels} />
          )
        ) : null}
        {!active && !canCheckout && (
          <p role="status">
            {t(
              status === "UNAVAILABLE" || !billingEnabled()
                ? "fixmit_billing_unavailable"
                : "fixmit_billing_inactive"
            )}
          </p>
        )}
        {hasSubscription && (
          <a
            className={styles.secondary}
            href={
              process.env.PAYPAL_ENVIRONMENT === "sandbox"
                ? "https://www.sandbox.paypal.com/myaccount/autopay/"
                : "https://www.paypal.com/myaccount/autopay/"
            }>
            {t("fixmit_billing_manage")}
          </a>
        )}
        <nav style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 13 }}>
          {["pricing", "terms", "privacy", "refund", "imprint"].map((slug) => (
            <a key={slug} href={`/${slug}?lang=${user.locale === "en" ? "en" : "de"}`}>
              {t(`public_${slug}_title`)}
            </a>
          ))}
        </nav>
        <a className={styles.secondary} href="/auth/logout">
          {t("sign_out")}
        </a>
      </section>
    </main>
  );
}
