import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestStudio, saveStudioStripe } from "./actions";
import StudioStripeForm from "./StudioStripeForm";

vi.mock("./actions", () => ({ saveStudioStripe: vi.fn(), createTestStudio: vi.fn() }));
vi.mock("@calcom/lib/hooks/useLocale", () => ({ useLocale: () => ({ t: (key: string) => key }) }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("studio Stripe form", () => {
  it("hides secrets and locks an existing account", () => {
    render(<StudioStripeForm teamId={100} accountId="acct_fixture" />);
    expect(screen.getByLabelText("merchant_stripe_restricted_key").getAttribute("type")).toBe("password");
    expect(screen.getByLabelText("merchant_stripe_webhook_secret").getAttribute("type")).toBe("password");
    expect(screen.getByLabelText("merchant_stripe_account").hasAttribute("readonly")).toBe(true);
  });

  it("submits the scoped form and clears secrets after success", async () => {
    vi.mocked(saveStudioStripe).mockResolvedValue({ ok: true });
    render(<StudioStripeForm teamId={100} />);
    fireEvent.change(screen.getByLabelText("merchant_stripe_restricted_key"), {
      target: { value: "rk_test_fixture" },
    });
    fireEvent.submit(screen.getByRole("button").closest("form")!);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("merchant_stripe_saved"));
    expect(vi.mocked(saveStudioStripe).mock.calls[0][0].get("teamId")).toBe("100");
    expect((screen.getByLabelText("merchant_stripe_restricted_key") as HTMLInputElement).value).toBe("");
  });

  it("shows only a safe error on network failure", async () => {
    vi.mocked(saveStudioStripe).mockRejectedValue(new Error("sensitive provider details"));
    render(<StudioStripeForm teamId={100} />);
    fireEvent.submit(screen.getByRole("button").closest("form")!);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("merchant_stripe_save_failed"));
    expect(screen.queryByText("sensitive provider details")).toBeNull();
  });

  it("creates a studio through the dedicated action, not the payment action", async () => {
    vi.mocked(createTestStudio).mockResolvedValue({ ok: true });
    render(<StudioStripeForm createStudio />);
    fireEvent.change(screen.getByLabelText("merchant_stripe_studio_name"), {
      target: { value: "Test Studio" },
    });
    fireEvent.submit(screen.getByRole("button").closest("form")!);
    await waitFor(() => expect(createTestStudio).toHaveBeenCalledOnce());
    expect(saveStudioStripe).not.toHaveBeenCalled();
  });
});
