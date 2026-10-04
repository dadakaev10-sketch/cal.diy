import { createNextApiHandler } from "@calcom/trpc/server/createNextApiHandler";
import { meRouter } from "@calcom/trpc/server/routers/viewer/me/_router";

// A 2 MB cover image needs room for base64 encoding in the profile payload.
export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

export default createNextApiHandler(meRouter);
