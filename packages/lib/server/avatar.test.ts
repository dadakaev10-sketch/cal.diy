import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();
const mockUuidv4 = vi.fn();
const mockConvertSvgToPng = vi.fn();

vi.mock("uuid", () => ({
  v4: (...args: unknown[]) => mockUuidv4(...args),
}));

vi.mock("@calcom/prisma", () => ({
  prisma: {
    avatar: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
  },
}));

vi.mock("./imageUtils", () => ({
  convertSvgToPng: (...args: unknown[]) => mockConvertSvgToPng(...args),
}));

import { uploadAvatar } from "./avatar";

describe("uploadAvatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConvertSvgToPng.mockImplementation((data: string) => Promise.resolve(`processed_${data}`));
    mockUpsert.mockResolvedValue(undefined);
    mockUuidv4.mockReturnValue("generated-uuid-1234");
  });

  it("generates new objectKey via uuidv4 when no existing avatar", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await uploadAvatar({ userId: 1, avatar: "image-data" });

    expect(mockUuidv4).toHaveBeenCalled();
    expect(result).toMatch(/^\/api\/avatar\/generated-uuid-1234\.png\?v=[a-f0-9]{16}$/);
  });

  it("reuses existing objectKey and does NOT call uuidv4", async () => {
    mockFindUnique.mockResolvedValue({ objectKey: "existing-key-5678" });

    const result = await uploadAvatar({ userId: 1, avatar: "image-data" });

    expect(mockUuidv4).not.toHaveBeenCalled();
    expect(result).toMatch(/^\/api\/avatar\/existing-key-5678\.png\?v=[a-f0-9]{16}$/);
  });

  it("includes objectKey in create clause but NOT in update clause", async () => {
    mockFindUnique.mockResolvedValue(null);

    await uploadAvatar({ userId: 1, avatar: "image-data" });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ objectKey: "generated-uuid-1234" }),
        update: expect.not.objectContaining({ objectKey: expect.anything() }),
      })
    );
  });

  it("returns /api/avatar/{objectKey}.png", async () => {
    mockFindUnique.mockResolvedValue({ objectKey: "my-key" });

    const result = await uploadAvatar({ userId: 5, avatar: "data" });

    expect(result).toMatch(/^\/api\/avatar\/my-key\.png\?v=[a-f0-9]{16}$/);
  });

  it("uses correct compound unique key for lookup and upsert", async () => {
    mockFindUnique.mockResolvedValue(null);

    await uploadAvatar({ userId: 42, avatar: "data" });

    const expectedWhere = {
      teamId_userId_isBanner: { teamId: 0, userId: 42, isBanner: false },
    };

    expect(mockFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere }));
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere }));
  });

  it("calls convertSvgToPng on input data", async () => {
    mockFindUnique.mockResolvedValue(null);

    await uploadAvatar({ userId: 1, avatar: "svg-data-here" });

    expect(mockConvertSvgToPng).toHaveBeenCalledWith("svg-data-here");
  });

  it("passes processed data to upsert create and update", async () => {
    mockFindUnique.mockResolvedValue(null);

    await uploadAvatar({ userId: 1, avatar: "raw-data" });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ data: "processed_raw-data" }),
        update: expect.objectContaining({ data: "processed_raw-data" }),
      })
    );
  });

  it("sets isBanner to false in create clause", async () => {
    mockFindUnique.mockResolvedValue(null);

    await uploadAvatar({ userId: 1, avatar: "data" });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ isBanner: false }),
      })
    );
  });
  it("changes the image URL after recropping without breaking the existing object key", async () => {
    mockFindUnique.mockResolvedValue({ objectKey: "existing-key" });
    const before = await uploadAvatar({ userId: 1, avatar: "first-crop" });
    const after = await uploadAvatar({ userId: 1, avatar: "second-crop" });
    const repeated = await uploadAvatar({ userId: 1, avatar: "second-crop" });
    expect(after).not.toBe(before);
    expect(repeated).toBe(after);
    expect(new URL(after, "https://fixmit.com").pathname).toBe(
      new URL(before, "https://fixmit.com").pathname
    );
    expect(mockUpsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ update: { data: "processed_second-crop" } })
    );
  });
});
