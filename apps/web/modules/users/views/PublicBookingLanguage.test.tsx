import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicBookingLanguage } from "./PublicBookingLanguage";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), load: vi.fn() }));
vi.mock("@calcom/prisma", () => ({ prisma: { user: { findFirst: mocks.findFirst } } }));
vi.mock("@calcom/i18n/server", () => ({ loadTranslations: mocks.load }));

describe("public booking page language integration", () => {
  beforeEach(() => {
    mocks.findFirst.mockResolvedValue({ metadata: { bookingPageLanguage: "es" }, locale: "de" });
    mocks.load.mockResolvedValue({ language: "Idioma" });
  });
  it("loads the studio preference independently of the signed-in UI language", async () => {
    render(
      await PublicBookingLanguage({ username: "demo-studio", requested: undefined, children: <p>Studio</p> })
    );
    expect(mocks.load).toHaveBeenCalledWith("es", "common");
    expect(screen.getByRole("combobox", { name: "Idioma" })).toHaveValue("es");
    expect(screen.getAllByRole("option")).toHaveLength(6);
    expect(screen.getByText("Studio").closest("[lang]")).toHaveAttribute("lang", "es");
  });
  it("lets visitors override a treatment's old interface language", async () => {
    render(
      await PublicBookingLanguage({
        username: "demo-studio",
        requested: "fr",
        eventLanguage: "de",
        children: <p>Booking</p>,
      })
    );
    expect(mocks.load).toHaveBeenCalledWith("fr", "common");
    expect(screen.getByRole("combobox")).toHaveValue("fr");
  });
  it("preserves the previous studio locale until a preference is saved", async () => {
    mocks.findFirst.mockResolvedValue({ metadata: {}, locale: "ru" });
    await PublicBookingLanguage({ username: "demo-studio", requested: "invalid", children: null });
    expect(mocks.load).toHaveBeenCalledWith("ru", "common");
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { username: { equals: "demo-studio", mode: "insensitive" } },
      select: { metadata: true, locale: true },
    });
  });
});
