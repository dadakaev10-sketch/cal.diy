import { z } from "zod";
export const bookingCredentialSchema = z.object({
  stripe_user_id: z.string().startsWith("acct_"),
  default_currency: z.string(),
  stripe_publishable_key: z.string().startsWith("pk_"),
  fixmitConnection: z.literal("restricted").optional(),
  liveMode: z.boolean().optional(),
  webhookRoute: z
    .string()
    .regex(/^[a-f0-9]{48}$/)
    .optional(),
  webhookEndpoint: z.string().startsWith("we_").optional(),
});
