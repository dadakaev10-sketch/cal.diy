import type { TFunction } from "i18next";
import type { BaseEmailHtml } from "../components/BaseEmailHtml";
import { StudioAccountEmail } from "../components/StudioAccountEmail";

export type PasswordReset = {
  language: TFunction;
  user: { name?: string | null; email: string };
  resetLink: string;
};

export const ForgotPasswordEmail = (
  props: PasswordReset & Partial<React.ComponentProps<typeof BaseEmailHtml>>
) => (
  <StudioAccountEmail
    subject={props.language("reset_password_subject", { appName: "DADAKAEV CAL" })}
    heading={props.language("change_password")}
    preview={props.language("someone_requested_password_reset")}
    action={{ label: props.language("change_password"), href: props.resetLink }}
    fallbackLabel={props.language("verify_email_email_link_text")}
    notice={props.language("password_reset_instructions")}>
    <p style={{ margin: "0 0 16px" }}>
      {props.language("hi_user_name", { name: props.user.name || props.language("there") })}!
    </p>
    <p style={{ margin: 0 }}>{props.language("someone_requested_password_reset")}</p>
  </StudioAccountEmail>
);
