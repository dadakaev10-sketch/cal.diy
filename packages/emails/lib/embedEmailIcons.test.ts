import { Buffer } from "node:buffer";
import { BASE_URL } from "@calcom/lib/constants";
import { createTransport } from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import { describe, expect, it } from "vitest";
import { embedEmailIcons } from "./embedEmailIcons";
import { inlineEmailIconData } from "./inlineEmailIconData";

describe("embedded email symbols", () => {
  it.each(Object.keys(inlineEmailIconData))("embeds %s with valid PNG bytes", (name) => {
    const result = embedEmailIcons({ html: `<img src="${BASE_URL}/emails/${name}.png" />` });
    const attachments = result.attachments as Mail.Attachment[];
    expect(result.html).toContain(`src="cid:${attachments[0].cid}"`);
    expect(attachments).toHaveLength(1);
    expect(attachments[0].contentType).toBe("image/png");
    expect(Buffer.isBuffer(attachments[0].content)).toBe(true);
    expect((attachments[0].content as Buffer).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });
  it("preserves calendar data and attachments while removing remote icon alternatives", () => {
    const pdf = { filename: "document.pdf", content: Buffer.from("test") };
    const original = {
      html: `<img src='${BASE_URL}/emails/rejectIcon.png' srcSet='${BASE_URL}/emails/rejectIcon.svg'/><img src='${BASE_URL}/emails/rejectIcon.png'/>`,
      attachments: [pdf],
      icalEvent: { method: "CANCEL", content: "calendar" },
    };
    const result = embedEmailIcons(original);
    expect(result.html).not.toContain(`${BASE_URL}/emails/`);
    expect(result.attachments).toHaveLength(2);
    expect((result.attachments as Mail.Attachment[])[0]).toBe(pdf);
    expect(result.icalEvent).toBe(original.icalEvent);
    expect(original.attachments).toHaveLength(1);
    expect(embedEmailIcons(result)).toBe(result);
  });
  it("leaves unrelated images and text-only emails unchanged", () => {
    const html = { html: '<img src="https://other.example/logo.png"/>' };
    expect(embedEmailIcons(html)).toBe(html);
    const text = { text: "hello" };
    expect(embedEmailIcons(text)).toBe(text);
  });
  it("produces multipart MIME with matching Content-ID and embedded bytes without SMTP", async () => {
    const payload = embedEmailIcons({
      from: "studio@fixmit-test.invalid",
      to: "customer@fixmit-test.invalid",
      subject: "test",
      html: `<img src="${BASE_URL}/emails/xCircle@2x.png"/>`,
      icalEvent: { method: "CANCEL", content: "BEGIN:VCALENDAR\r\nEND:VCALENDAR" },
    });
    const result = await createTransport({ streamTransport: true, buffer: true, newline: "unix" }).sendMail(
      payload
    );
    const mime = result.message.toString();
    expect(mime).toContain("multipart/related");
    expect(mime).toContain("Content-ID: <fixmit-xCircle-2x@inline.fixmit.com>");
    expect(mime).toContain("Content-Type: image/png");
    expect(mime).toContain("Content-Disposition: inline");
    expect(mime).toContain("text/calendar");
    expect(mime).not.toContain(`${BASE_URL}/emails/xCircle@2x.png`);
  });
});
