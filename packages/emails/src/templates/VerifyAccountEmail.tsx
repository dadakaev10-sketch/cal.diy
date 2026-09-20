import type { TFunction } from "i18next";
import type { BaseEmailHtml } from "../components/BaseEmailHtml";
import { StudioAccountEmail } from "../components/StudioAccountEmail";

export type EmailVerifyLink = {
  language: TFunction;
  user: { name?: string | null; email: string };
  verificationEmailLink: string;
};

export const VerifyAccountEmail = (
  props: EmailVerifyLink & Partial<React.ComponentProps<typeof BaseEmailHtml>>
) => (
  <StudioAccountEmail
    subject={props.language("verify_email_subject", { appName: "DADAKAEV CAL" })}
    heading={props.language("verify_email_email_header")}
    preview={props.language("verify_email_email_body", { appName: "DADAKAEV CAL" })}
    action={{ label: props.language("verify_email_button"), href: props.verificationEmailLink }}
    fallbackLabel={props.language("verify_email_email_link_text")}>
    <p style={{ margin: "0 0 16px" }}>
      {props.language("hi_user_name", { name: props.user.name || props.language("there") })}!
    </p>
    <p style={{ margin: 0 }}>{props.language("verify_email_email_body", { appName: "DADAKAEV CAL" })}</p>
  </StudioAccountEmail>
);
