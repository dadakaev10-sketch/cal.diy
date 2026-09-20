import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@calcom/emails/templates/account-verify-email", () => ({
  default: class {
    async sendEmail() {}
  },
}));
vi.mock("@calcom/emails/templates/forgot-password-email", () => ({
  default: class {
    async sendEmail() {}
  },
}));

import process from "node:process";
import prisma from "@calcom/prisma";
import { studioAccountRateLimit, studioTokenHash } from "./studioAccountSecurity";
import { resetStudioPassword } from "./studioPasswordRecovery";
import { completeStudioRegistration } from "./studioRegistration";

const allowed = process.env.STUDIO_AUTH_TEST_DATABASE_URL;
if (
  !allowed ||
  allowed !== process.env.DATABASE_URL ||
  !/^postgresql:\/\/[^@]+@127\.0\.0\.1:55439\/postgres$/.test(allowed)
) {
  throw new Error("These tests require the explicitly isolated local studio auth database on port 55439");
}
const prefix = randomBytes(6).toString("hex");
const password = "A-Strong-Test-Password-123";
const tokens: string[] = [];
const emails: string[] = [];
async function seed(label: string) {
  const token = randomBytes(32).toString("hex");
  const email = `${prefix}-${label}@example.test`;
  tokens.push(studioTokenHash(token));
  emails.push(email);
  await prisma.studioRegistrationRequest.create({
    data: {
      tokenHash: studioTokenHash(token),
      email,
      locale: "en",
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  return {
    token,
    name: "Owner",
    studioName: "Test Studio",
    slug: `${prefix}-${label}`,
    timeZone: "Europe/Vienna",
    password,
  };
}

beforeAll(() => {
  vi.stubEnv("NEXTAUTH_SECRET", "local-test-secret");
});
afterAll(async () => {
  await prisma.team.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  await prisma.studioRegistrationRequest.deleteMany({ where: { tokenHash: { in: tokens } } });
  await prisma.resetPasswordRequest.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
});

describe("studio authentication with real PostgreSQL transactions", () => {
  it("allows exactly one registration from concurrent requests", async () => {
    const input = await seed("concurrent");
    const results = await Promise.all([completeStudioRegistration(input), completeStudioRegistration(input)]);
    expect(results.filter((result) => result === "studio_registration_complete")).toHaveLength(1);
    expect(await prisma.user.count({ where: { email: emails[0] } })).toBe(1);
    const team = await prisma.team.findFirst({
      where: { slug: input.slug },
      select: { members: { select: { role: true, accepted: true, user: { select: { email: true } } } } },
    });
    expect(team?.members).toEqual([{ role: "OWNER", accepted: true, user: { email: emails[0] } }]);
  });
  it("allows exactly one reset even with two valid links", async () => {
    const email = emails[0];
    const links = [randomBytes(32).toString("hex"), randomBytes(32).toString("hex")];
    for (const token of links)
      await prisma.resetPasswordRequest.create({
        data: { id: studioTokenHash(token), email, expires: new Date(Date.now() + 60_000) },
      });
    const results = await Promise.all(links.map((token) => resetStudioPassword(token, password)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await prisma.resetPasswordRequest.count({ where: { email } })).toBe(0);
  });
  it("allows exactly one reset with the same token", async () => {
    const token = randomBytes(32).toString("hex");
    await prisma.resetPasswordRequest.create({
      data: { id: studioTokenHash(token), email: emails[0], expires: new Date(Date.now() + 60_000) },
    });
    const results = await Promise.all([
      resetStudioPassword(token, password),
      resetStudioPassword(token, password),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
  it("rolls back user, schedule and token consumption when team creation fails", async () => {
    const input = await seed("rollback");
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION studio_test_fail_team() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.slug = '${input.slug}' THEN RAISE EXCEPTION 'isolated rollback test'; END IF; RETURN NEW; END $$`
    );
    await prisma.$executeRawUnsafe(
      'CREATE TRIGGER studio_test_fail_team BEFORE INSERT ON "Team" FOR EACH ROW EXECUTE FUNCTION studio_test_fail_team()'
    );
    try {
      await expect(completeStudioRegistration(input)).rejects.toThrow();
      expect(await prisma.user.count({ where: { email: emails[1] } })).toBe(0);
      expect(
        await prisma.studioRegistrationRequest.count({ where: { tokenHash: studioTokenHash(input.token) } })
      ).toBe(1);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER studio_test_fail_team ON "Team"');
      await prisma.$executeRawUnsafe("DROP FUNCTION studio_test_fail_team()");
    }
  });
  it("caps parallel rate-limit attempts durably", async () => {
    const results = await Promise.all(
      Array.from({ length: 7 }, () => studioAccountRateLimit("integration", prefix, 3))
    );
    expect(results.filter(Boolean)).toHaveLength(3);
  });
});
