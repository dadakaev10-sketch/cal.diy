import { createHash, createPrivateKey, sign } from "node:crypto";
import { connect } from "node:http2";
import process from "node:process";
import prisma from "@calcom/prisma";
import { z } from "zod";

export const deviceInput = z
  .object({ token: z.string().regex(/^[a-f0-9]{64,256}$/), environment: z.enum(["sandbox", "production"]) })
  .strict();
const device = deviceInput.extend({
  kind: z.literal("fixmit-apns-v1"),
  sent: z.array(z.string()).max(100).default([]),
});
export function parseDevice(value: string) {
  try {
    const parsed = device.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
export function pushPayload(
  kind: "created" | "cancelled" | "rescheduled",
  uid: string,
  start: Date,
  zone: string
) {
  const title = { created: "Neue Buchung", cancelled: "Termin abgesagt", rescheduled: "Termin verschoben" }[
    kind
  ];
  const body = new Intl.DateTimeFormat("de-AT", {
    timeZone: zone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(start);
  return {
    aps: { alert: { title, body }, sound: "default", "thread-id": "fixmit-bookings" },
    bookingUid: uid,
  };
}
let cached: { value: string; until: number } | undefined;
function authorization() {
  if (cached && cached.until > Date.now()) return cached.value;
  const encodedKey = process.env.APNS_PRIVATE_KEY_BASE64;
  const key = encodedKey ? Buffer.from(encodedKey, "base64").toString("utf8") : undefined;
  const kid = process.env.APNS_KEY_ID;
  const iss = process.env.APNS_TEAM_ID;
  if (!key || !kid || !iss) throw new Error("APNS_NOT_CONFIGURED");
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({ iss, iat: Math.floor(Date.now() / 1000) })).toString(
    "base64url"
  );
  const input = `${header}.${claims}`;
  const signature = sign("sha256", Buffer.from(input), {
    key: createPrivateKey(key),
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  const value = `${input}.${signature}`;
  cached = { value, until: Date.now() + 40 * 60 * 1000 };
  return value;
}
export async function deliver(
  token: string,
  environment: "sandbox" | "production",
  payload: unknown,
  collapse: string
): Promise<number> {
  const auth = authorization();
  return new Promise((resolve, reject) => {
    const client = connect(
      environment === "sandbox" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com"
    );
    const timer = setTimeout(() => {
      client.destroy();
      reject(new Error("APNS_TIMEOUT"));
    }, 5000);
    const finish = () => {
      clearTimeout(timer);
      client.close();
    };
    client.on("error", () => {
      finish();
      reject(new Error("APNS_CONNECTION"));
    });
    const stream = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${auth}`,
      "apns-topic": "com.fixmit.studio",
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(Math.floor(Date.now() / 1000) + 3600),
      "apns-collapse-id": collapse,
    });
    let status = 0;
    stream.on("response", (headers) => {
      status = Number(headers[":status"]);
    });
    stream.on("data", () => {});
    stream.on("end", () => {
      finish();
      resolve(status);
    });
    stream.on("error", () => {
      finish();
      reject(new Error("APNS_STREAM"));
    });
    stream.end(JSON.stringify(payload));
  });
}
export async function notifyStudioBooking(
  uid: string | null | undefined,
  kind: "created" | "cancelled" | "rescheduled"
) {
  if (!uid || !process.env.APNS_PRIVATE_KEY_BASE64) return;
  try {
    const booking = await prisma.booking.findUnique({
      where: { uid },
      select: { userId: true, startTime: true, user: { select: { timeZone: true } } },
    });
    if (!booking?.userId) return;
    const subscriptions = await prisma.notificationsSubscriptions.findMany({
      where: { userId: booking.userId },
      select: { id: true, subscription: true },
    });
    const event = createHash("sha256")
      .update(`${uid}|${kind}|${booking.startTime.toISOString()}`)
      .digest("hex");
    await Promise.allSettled(
      subscriptions.map(async (row) => {
        const target = parseDevice(row.subscription);
        if (!target || target.sent.includes(event)) return;
        const payload = pushPayload(kind, uid, booking.startTime, booking.user?.timeZone || "Europe/Vienna");
        let status = await deliver(target.token, target.environment, payload, event);
        if (status === 429 || status >= 500)
          status = await deliver(target.token, target.environment, payload, event);
        if (status === 410) {
          await prisma.notificationsSubscriptions.deleteMany({
            where: { id: row.id, subscription: row.subscription },
          });
        } else if (status === 200) {
          await prisma.notificationsSubscriptions.updateMany({
            where: { id: row.id, subscription: row.subscription },
            data: { subscription: JSON.stringify({ ...target, sent: [...target.sent, event].slice(-100) }) },
          });
        } else {
          console.warn("Fixmit APNs rejected", status);
        }
      })
    );
  } catch {
    console.warn("Fixmit APNs delivery failed");
  }
}
