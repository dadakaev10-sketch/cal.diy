import { Buffer } from "node:buffer";
import { BASE_URL } from "@calcom/lib/constants";
import { inlineEmailIconData } from "./inlineEmailIconData";

export function embedEmailIcons(payload: Record<string, unknown>): Record<string, unknown> {
  if (typeof payload.html !== "string") return payload;
  let html = payload.html;
  const attachments = Array.isArray(payload.attachments) ? [...payload.attachments] : [];
  for (const [name, content] of Object.entries(inlineEmailIconData)) {
    const source = `${BASE_URL}/emails/${name}.png`;
    if (!html.includes(`src="${source}"`) && !html.includes(`src='${source}'`)) continue;
    const cid = `fixmit-${name.replace(/[^a-zA-Z0-9-]/g, "-")}@inline.fixmit.com`;
    html = html
      .replaceAll(`src="${source}"`, `src="cid:${cid}"`)
      .replaceAll(`src='${source}'`, `src='cid:${cid}'`);
    // Action icons provide a remote SVG srcset; use the same embedded PNG for that alternative.
    html = html.replaceAll(`${BASE_URL}/emails/${name}.svg`, `cid:${cid}`);
    attachments.push({
      filename: `${name}.png`,
      content: Buffer.from(content, "base64"),
      contentType: "image/png",
      contentDisposition: "inline",
      cid,
    });
  }
  if (html === payload.html) return payload;
  return { ...payload, html, attachments };
}
