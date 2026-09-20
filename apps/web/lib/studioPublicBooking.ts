const privateRoots = new Set([
  "_next",
  "_proxy",
  "api",
  "apps",
  "auth",
  "availability",
  "bookings",
  "connect",
  "confirm",
  "d",
  "e2e",
  "embed",
  "enterprise",
  "event-types",
  "forms",
  "getting-started",
  "help",
  "icons",
  "insights",
  "login",
  "maintenance",
  "more",
  "onboarding",
  "org",
  "payment",
  "payments",
  "recover",
  "refer",
  "register",
  "routing",
  "routing-forms",
  "settings",
  "signup",
  "studio-admin",
  "support",
  "team",
  "teams",
  "upgrade",
  "video",
  "workflows",
  "admin",
  "booking",
  "booking-successful",
  "reschedule",
  "cancel",
  "success",
]);

const queries: Record<string, ReadonlySet<string>> = {
  public: new Set(["event", "countryCode", "checkIfUserEmailVerificationRequired"]),
  slots: new Set(["getSchedule", "isAvailable"]),
  i18n: new Set(["get"]),
  timezones: new Set(["cityTimezones"]),
  features: new Set(["map"]),
};
const mutations: Record<string, ReadonlySet<string>> = {
  slots: new Set(["reserveSlot", "removeSelectedSlotMark"]),
  auth: new Set(["sendVerifyEmailCode", "verifyCodeUnAuthenticated"]),
};

export function studioPublicBookingRoute(path: string, method: string) {
  if (method === "POST" && ["/api/book/event", "/api/book/recurring-event", "/api/cancel"].includes(path))
    return "booking-write";
  const rpc = /^\/api\/trpc\/(public|slots|i18n|timezones|features|auth)\/([a-zA-Z,]+)$/.exec(path);
  if (rpc) {
    const [, namespace, procedures] = rpc;
    const names = procedures.split(",");
    if (method === "GET" && names.length <= 20 && names.every((name) => queries[namespace]?.has(name)))
      return "booking-read";
    // Never allow a private procedure to hitchhike on a public tRPC batch.
    if (method === "POST" && names.length === 1 && mutations[namespace]?.has(names[0]))
      return namespace === "auth" ? "booking-verification" : "booking-slot";
    return null;
  }
  if (!["GET", "HEAD"].includes(method)) return null;
  if (["/api/user/avatar", "/_next/image"].includes(path)) return "booking-read";
  if (/^\/(booking|booking-successful|reschedule|cancel|success)\/[a-zA-Z0-9_-]{16,64}(\/embed)?$/.test(path))
    return "booking-page";
  const segments = path.slice(1).split("/");
  if (privateRoots.has(segments[0].toLowerCase())) return null;
  if (segments.length > 3 || (segments.length === 3 && segments[2] !== "embed")) return null;
  if (segments.every((segment) => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(segment))) return "booking-page";
  return null;
}
