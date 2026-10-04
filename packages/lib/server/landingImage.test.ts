import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { upsert } = vi.hoisted(() => ({ upsert: vi.fn().mockResolvedValue({}) }));
vi.mock("@calcom/prisma", () => ({ prisma: { avatar: { upsert } } }));

import { uploadLandingImage } from "./landingImage";

describe("landing image storage", () => {
  beforeEach(() => upsert.mockClear());
  it("normalizes uploaded bytes and scopes the banner to its owner", async () => {
    const input = await sharp({ create: { width: 1600, height: 800, channels: 3, background: "#fff" } })
      .jpeg()
      .toBuffer();
    const url = await uploadLandingImage(123, `data:image/jpeg;base64,${input.toString("base64")}`);
    expect(url).toMatch(/^\/api\/avatar\/[a-f0-9-]+\.png$/);
    const args = upsert.mock.calls[0][0];
    expect(args.where.teamId_userId_isBanner).toEqual({ teamId: 0, userId: 123, isBanner: true });
    const result = await sharp(Buffer.from(args.create.data.split(",")[1], "base64")).metadata();
    expect(result.width).toBe(1400);
    expect(result.height).toBe(700);
    expect(result.format).toBe("png");
  });
  it("rejects malformed bytes before writing storage", async () => {
    await expect(uploadLandingImage(123, "data:image/png;base64,bm90YW5pbWFnZQ==")).rejects.toThrow();
    expect(upsert).not.toHaveBeenCalled();
  });
});
