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
export const socialPlatforms = ["instagram", "youtube", "tiktok", "x", "linkedin", "facebook"] as const;
export const landingSectionSchema = z
  .object({
    id: z.string().uuid(),
    type: z.enum(["link", "text", "booking"]),
    title: z.string().trim().min(1).max(100),
    description: z.string().trim().max(1500),
    image: z.union([z.literal(""), httpsUrl]),
    url: z.union([z.literal(""), httpsUrl]),
    buttonLabel: z.string().trim().max(40),
    priceLabel: z.string().trim().max(40),
    enabled: z.boolean(),
  })
  .refine((section) => section.type !== "link" || section.url !== "", {
    path: ["url"],
    message: "A link section requires a URL",
  });
export type LandingSection = z.infer<typeof landingSectionSchema>;
export const landingPageSchema = z.object({
  mode: z.enum(["booking", "landing"]),
  layout: z.enum(["portrait", "cover", "creator"]),
  headline: z.string().trim().max(100),
  description: z.string().trim().max(1500),
  coverImage: landingImageSchema,
  showBookingButton: z.boolean().default(true),
  sections: z
    .array(landingSectionSchema)
    .max(12)
    .default([])
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length),
  socialLinks: z
    .array(z.object({ platform: z.enum(socialPlatforms), url: httpsUrl }))
    .max(6)
    .default([])
    .refine((items) => new Set(items.map((item) => item.platform)).size === items.length),
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
  sections: [],
  socialLinks: [],
  showBookingButton: true,
};
export function readLandingPage(metadata: unknown): LandingPage {
  const parsed = z.object({ landingPage: landingPageSchema }).safeParse(metadata);
  return parsed.success
    ? parsed.data.landingPage
    : { ...defaultLandingPage, links: [], sections: [], socialLinks: [] };
}
export function publicLandingPage(metadata: unknown): LandingPage | null {
  const page = readLandingPage(metadata);
  if (page.mode !== "landing") return null;
  // Uploaded bytes belong in image storage, never in public page props.
  return {
    ...page,
    sections: page.sections.filter((section) => section.enabled),
    coverImage: page.coverImage.startsWith("data:") ? "" : page.coverImage,
  };
}
