import { prisma } from "@calcom/prisma";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";

export async function uploadLandingImage(userId: number, image: string) {
  const buffer = Buffer.from(image.slice(image.indexOf(",") + 1), "base64");
  const normalized = await sharp(buffer, { limitInputPixels: 25000000 })
    .rotate()
    .resize(1400, 1000, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  const objectKey = uuidv4();
  await prisma.avatar.upsert({
    where: { teamId_userId_isBanner: { teamId: 0, userId, isBanner: true } },
    create: {
      userId,
      isBanner: true,
      objectKey,
      data: `data:image/png;base64,${normalized.toString("base64")}`,
    },
    update: { objectKey, data: `data:image/png;base64,${normalized.toString("base64")}` },
  });
  return `/api/avatar/${objectKey}.png`;
}
