import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { studioPublicBookingRoute as route } from "./studioPublicBooking";

describe("public customer booking boundary", () => {
  it("serves uploaded public avatars without opening avatar administration", () => {
    const path = "/api/avatar/689513a2-5dfa-4a43-8b2a-e2c798254c18.png";
    expect(route(path, "GET")).toBe("booking-read");
    expect(route(path, "HEAD")).toBe("booking-read");
    expect(route(path, "POST")).toBeNull();
    expect(route("/api/avatar", "GET")).toBeNull();
    expect(route(`${path}/private`, "GET")).toBeNull();
    expect(route("/api/avatar/not-a-uuid.png", "GET")).toBeNull();
  });
  it.each([
    "/dadakaev",
    "/dadakaev/beratung",
    "/dadakaev/embed",
    "/dadakaev/beratung/embed",
    "/booking/abcdefghijklmnopqrstuv",
    "/reschedule/abcdefghijklmnopqrstuv",
    "/dadakaev/avatar.png",
  ])("allows customer page %s without a session", (path) => {
    expect(route(path, "GET")).toBe("booking-page");
    expect(route(path, "POST")).toBeNull();
  });
  it.each([
    "/booking/abcdefghijklmnopqrstuv/logs",
    "/settings/my-account",
    "/event-types/12",
    "/studio-admin",
    "/api/trpc/me/get",
    "/api/trpc/public/event,submitRating",
    "/api/trpc/slots/getSchedule,private",
    "/api/trpc/auth/changePassword",
    "/api/trpc/slots/getSchedule%2cprivate",
    "/api/trpc/slots/",
    "/api/v2/bookings",
  ])("keeps private or unaudited routes closed: %s", (path) => {
    expect(route(path, "GET")).toBeNull();
    expect(route(path, "POST")).toBeNull();
  });
  it("checks every procedure in read batches and rejects mutation batches", () => {
    expect(route("/api/trpc/i18n/get", "GET")).toBe("booking-read");
    expect(route("/api/trpc/constructor/get", "GET")).toBeNull();
    expect(route("/api/trpc/slots/getSchedule,isAvailable", "GET")).toBe("booking-read");
    expect(route("/api/trpc/slots/getSchedule,isAvailable", "POST")).toBeNull();
    expect(route("/api/trpc/slots/reserveSlot", "POST")).toBe("booking-slot");
    expect(route("/api/trpc/slots/reserveSlot,reserveSlot", "POST")).toBeNull();
    expect(route("/api/book/event", "POST")).toBe("booking-write");
    expect(route("/api/book/event", "GET")).toBeNull();
  });
  it("does not mistake any existing static application page for a username", () => {
    const root = join(__dirname, "../app");
    const visit = (directory: string, segments: string[]) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory())
          visit(
            join(directory, entry.name),
            entry.name.startsWith("(") ? segments : [...segments, entry.name]
          );
        else if (entry.name === "page.tsx" && segments[0] && !segments[0].startsWith("[")) {
          const path = `/${segments.map((s) => (s.startsWith("[") ? "abcdefghijklmnopqrstuv" : s)).join("/")}`;
          if (
            path === "/booking/dry-run-successful" ||
            /^\/(booking|booking-successful|reschedule)\/abcdefghijklmnopqrstuv(\/embed)?$/.test(path)
          )
            continue;
          expect(route(path, "GET"), path).toBeNull();
        }
      }
    };
    visit(root, []);
  });
});
