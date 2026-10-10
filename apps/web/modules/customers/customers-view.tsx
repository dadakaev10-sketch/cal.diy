"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { Customer } from "./customer-directory";

const PAGE_SIZE = 20;

export default function CustomersView({ customers }: { customers: Customer[] }) {
  const { t, i18n } = useLocale();
  const router = useRouter();
  const [timeZone, setTimeZone] = useState("UTC");
  useEffect(() => setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone), []);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [refreshing, startTransition] = useTransition();
  const search = query.trim().toLocaleLowerCase();
  const filtered = customers.filter((customer) =>
    [customer.name, customer.email, customer.phoneNumber ?? ""].some((value) =>
      value.toLocaleLowerCase().includes(search)
    )
  );
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1));
  const selected = customers.find((customer) => customer.email === selectedEmail);
  const date = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          className="border-default bg-default text-default w-full rounded-md border px-3 py-2 sm:max-w-md"
          aria-label={t("customer_search")}
          placeholder={t("customer_search")}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
          type="search"
        />
        <Button
          color="secondary"
          disabled={refreshing}
          onClick={() => startTransition(() => router.refresh())}>
          {t("customer_refresh")}
        </Button>
        <p className="text-subtle text-sm">{t("customer_count", { count: filtered.length })}</p>
      </div>
      {selected ? (
        <section
          className="border-subtle bg-default rounded-lg border p-4 sm:p-6"
          aria-label={t("customer_history")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-emphasis break-words text-lg font-semibold">
                {selected.name || selected.email}
              </h2>
              <a className="text-default block break-all underline" href={`mailto:${selected.email}`}>
                {selected.email}
              </a>
              {selected.phoneNumber && (
                <a
                  className="text-default block underline"
                  href={`tel:${selected.phoneNumber.replace(/[^+\d]/g, "")}`}>
                  {selected.phoneNumber}
                </a>
              )}
            </div>
            <Button color="secondary" onClick={() => setSelectedEmail(null)}>
              {t("close")}
            </Button>
          </div>
          <h3 className="text-emphasis mt-6 font-medium">{t("customer_history")}</h3>
          <p className="text-subtle mb-3 text-sm">{t("customer_history_description")}</p>
          <ul className="divide-subtle divide-y">
            {selected.bookings.map((booking) => (
              <li key={booking.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between">
                <div>
                  <p className="text-default font-medium">{booking.title}</p>
                  <p className="text-subtle text-sm">
                    {date(booking.startTime)} – {date(booking.endTime)}
                  </p>
                </div>
                <span className="text-subtle text-sm">
                  {t(`customer_status_${booking.status.toLowerCase()}`)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="border-subtle bg-default overflow-hidden rounded-lg border">
        {!filtered.length ? (
          <p className="text-subtle p-8 text-center">
            {t(customers.length ? "customer_no_results" : "customer_empty")}
          </p>
        ) : (
          <ul className="divide-subtle divide-y">
            {filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((customer) => (
              <li key={customer.email}>
                <button
                  type="button"
                  onClick={() => setSelectedEmail(customer.email)}
                  className="hover:bg-subtle focus-visible:ring-emphasis flex w-full flex-col gap-2 p-4 text-left focus-visible:ring-2 focus-visible:ring-inset sm:flex-row sm:items-center sm:justify-between"
                  aria-expanded={selectedEmail === customer.email}>
                  <div className="min-w-0">
                    <p className="text-emphasis break-words font-medium">{customer.name || customer.email}</p>
                    <p className="text-subtle break-all text-sm">{customer.email}</p>
                    <p className="text-subtle text-sm">{customer.phoneNumber || t("customer_no_phone")}</p>
                  </div>
                  <span className="text-subtle shrink-0 text-sm">
                    {t("customer_appointments", { count: customer.bookings.length })} →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <Button color="secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
            {t("customer_previous")}
          </Button>
          <span className="text-subtle text-sm">
            {currentPage + 1} / {Math.ceil(filtered.length / PAGE_SIZE)}
          </span>
          <Button
            color="secondary"
            disabled={(currentPage + 1) * PAGE_SIZE >= filtered.length}
            onClick={() => setPage(currentPage + 1)}>
            {t("customer_next")}
          </Button>
        </div>
      )}
    </div>
  );
}
