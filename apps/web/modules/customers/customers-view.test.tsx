import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CustomersView from "./customers-view";

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key, i18n: { language: "de" } }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@calcom/ui/components/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));
afterEach(cleanup);
const customers = [
  {
    name: "Anna",
    email: "anna@example.com",
    phoneNumber: "+43 123",
    bookings: [
      {
        id: 1,
        title: "Gesichtsbehandlung",
        startTime: "2026-10-01T10:00:00Z",
        endTime: "2026-10-01T11:00:00Z",
        status: "ACCEPTED",
      },
    ],
  },
  { name: "Ben", email: "ben@example.com", phoneNumber: null, bookings: [] },
];

describe("customers view", () => {
  it("finds customers by phone and opens their appointments and contact links", () => {
    render(<CustomersView customers={customers} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "+43" } });
    expect(screen.queryByText("Ben")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Anna"));
    expect(screen.getByText("Gesichtsbehandlung")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "anna@example.com" })).toHaveAttribute(
      "href",
      "mailto:anna@example.com"
    );
    expect(screen.getByRole("link", { name: "+43 123" })).toHaveAttribute("href", "tel:+43123");
  });
  it("distinguishes no bookings from a search with no results", () => {
    const { rerender } = render(<CustomersView customers={[]} />);
    expect(screen.getByText("customer_empty")).toBeInTheDocument();
    rerender(<CustomersView customers={customers} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "missing" } });
    expect(screen.getByText("customer_no_results")).toBeInTheDocument();
  });
});
