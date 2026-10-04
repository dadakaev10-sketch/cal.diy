import { z } from "zod";

const httpsUrl = z
  .string()
  .trim()
  .max(2000)
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  });
export const landingImageSchema = z.union([
  z.literal(""),
  httpsUrl,
  z.string().regex(/^\/api\/avatar\/[a-f0-9-]{36}\.png$/),
  z
    .string()
    .max(2800000)
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/),
]);
export const landingPageSchema = z.object({
  mode: z.enum(["booking", "landing"]),
  layout: z.enum(["portrait", "cover"]),
  headline: z.string().trim().max(100),
  description: z.string().trim().max(1500),
  coverImage: landingImageSchema,
  links: z.array(z.object({ label: z.string().trim().min(1).max(40), url: httpsUrl })).max(5),
});
export type LandingPage = z.infer<typeof landingPageSchema>;
export const defaultLandingPage: LandingPage = {
  mode: "booking",
  layout: "portrait",
  headline: "",
  description: "",
  coverImage: "",
  links: [],
};
export function readLandingPage(metadata: unknown): LandingPage {
  const parsed = z.object({ landingPage: landingPageSchema }).safeParse(metadata);
  return parsed.success ? parsed.data.landingPage : { ...defaultLandingPage, links: [] };
}
export function publicLandingPage(metadata: unknown): LandingPage | null {
  const page = readLandingPage(metadata);
  if (page.mode !== "landing") return null;
  // Uploaded bytes belong in image storage, never in public page props.
  return { ...page, coverImage: page.coverImage.startsWith("data:") ? "" : page.coverImage };
}
