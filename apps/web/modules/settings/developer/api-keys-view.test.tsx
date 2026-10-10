import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("@calcom/trpc/react", () => ({
  trpc: { viewer: { apiKeys: { list: { useQuery: query } } } },
}));
vi.mock("@calcom/lib/hooks/useLocale", () => ({ useLocale: () => ({ t: (key: string) => key }) }));
vi.mock("@calcom/features/settings/appDir/SettingsHeader", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@calcom/features/components/controlled-dialog", () => ({ Dialog: () => null }));
vi.mock("@calcom/ui/components/dialog", () => ({ DialogContent: () => null }));
vi.mock("@calcom/ui/components/button", () => ({ Button: () => null }));
vi.mock("@calcom/ui/components/empty-screen", () => ({
  EmptyScreen: ({ headline }: { headline: string }) => <p>{headline}</p>,
}));
vi.mock("../../api-keys/api-keys/components/ApiKeyDialogForm", () => ({ default: () => null }));
vi.mock("../../api-keys/api-keys/components/ApiKeyListItem", () => ({
  default: ({ apiKey }: { apiKey: { note: string } }) => <p>{apiKey.note}</p>,
}));

import ApiKeysView from "./api-keys-view";

beforeEach(() => query.mockReset());

describe("API key list freshness", () => {
  it("shows newly fetched keys even when the server initially returned an empty list", () => {
    query.mockReturnValue({ data: [] });
    const { rerender } = render(<ApiKeysView apiKeys={[]} />);
    expect(screen.getByText("create_first_api_key")).toBeInTheDocument();
    query.mockReturnValue({ data: [{ id: "test-key", note: "Booking integration" }] });
    rerender(<ApiKeysView apiKeys={[]} />);
    expect(screen.getByText("Booking integration")).toBeInTheDocument();
    expect(screen.queryByText("create_first_api_key")).not.toBeInTheDocument();
  });

  it("reflects renamed and deleted keys from the refreshed query", () => {
    query.mockReturnValue({ data: [{ id: "test-key", note: "Original name" }] });
    const { rerender } = render(<ApiKeysView apiKeys={[]} />);
    query.mockReturnValue({ data: [{ id: "test-key", note: "Updated name" }] });
    rerender(<ApiKeysView apiKeys={[]} />);
    expect(screen.getByText("Updated name")).toBeInTheDocument();
    expect(screen.queryByText("Original name")).not.toBeInTheDocument();
    query.mockReturnValue({ data: [] });
    rerender(<ApiKeysView apiKeys={[]} />);
    expect(screen.queryByText("Updated name")).not.toBeInTheDocument();
    expect(screen.getByText("create_first_api_key")).toBeInTheDocument();
  });
});
