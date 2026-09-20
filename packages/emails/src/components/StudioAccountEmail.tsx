import type { ReactNode } from "react";

export function StudioAccountEmail(props: {
  subject: string;
  heading: string;
  preview: string;
  children: ReactNode;
  action: { label: string; href: string };
  fallbackLabel: string;
  notice?: string;
}) {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light" />
        <title>{props.subject}</title>
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: "#f2f5f2",
          fontFamily: "Arial, Helvetica, sans-serif",
          color: "#193d35",
        }}>
        <div style={{ display: "none", maxHeight: 0, overflow: "hidden", opacity: 0 }}>{props.preview}</div>
        <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" border={0}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: "40px 16px" }}>
                <table
                  role="presentation"
                  width="100%"
                  cellPadding="0"
                  cellSpacing="0"
                  border={0}
                  style={{ maxWidth: 560 }}>
                  <tbody>
                    <tr>
                      <td
                        style={{
                          padding: "0 8px 24px",
                          fontSize: 17,
                          letterSpacing: "2px",
                          fontWeight: 700,
                        }}>
                        DADAKAEV <span style={{ color: "#658677", fontWeight: 400 }}>CAL</span>
                      </td>
                    </tr>
                    <tr>
                      <td
                        style={{
                          backgroundColor: "#ffffff",
                          border: "1px solid #dce5df",
                          borderRadius: 16,
                          padding: "36px 28px",
                          borderTop: "4px solid #245c49",
                        }}>
                        <h1
                          style={{
                            margin: "0 0 24px",
                            fontSize: 28,
                            lineHeight: "36px",
                            letterSpacing: "-0.6px",
                            fontWeight: 700,
                          }}>
                          {props.heading}
                        </h1>
                        <div style={{ color: "#52645c", fontSize: 16, lineHeight: "26px" }}>
                          {props.children}
                        </div>
                        <table
                          role="presentation"
                          cellPadding="0"
                          cellSpacing="0"
                          border={0}
                          style={{ margin: "28px 0" }}>
                          <tbody>
                            <tr>
                              <td
                                style={{ backgroundColor: "#245c49", borderRadius: 8, textAlign: "center" }}>
                                <a
                                  href={props.action.href}
                                  style={{
                                    display: "inline-block",
                                    padding: "16px 24px",
                                    border: "1px solid #245c49",
                                    borderRadius: 8,
                                    color: "#ffffff",
                                    fontSize: 16,
                                    fontWeight: 700,
                                    lineHeight: "22px",
                                    textDecoration: "none",
                                  }}>
                                  {props.action.label}
                                </a>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        {props.notice ? (
                          <p
                            style={{
                              padding: "16px 18px",
                              backgroundColor: "#f2f6f3",
                              borderLeft: "3px solid #bacdc0",
                              borderRadius: 4,
                              fontSize: 14,
                              lineHeight: "22px",
                              color: "#52645c",
                              margin: "0 0 28px",
                            }}>
                            {props.notice}
                          </p>
                        ) : null}
                        <div
                          style={{
                            borderTop: "1px solid #e5ebe6",
                            paddingTop: 22,
                            fontSize: 12,
                            lineHeight: "20px",
                            color: "#697c71",
                          }}>
                          <p style={{ margin: "0 0 8px" }}>{props.fallbackLabel}</p>
                          <a
                            href={props.action.href}
                            style={{
                              color: "#245c49",
                              textDecoration: "underline",
                              overflowWrap: "anywhere",
                              wordBreak: "break-all",
                            }}>
                            {props.action.href}
                          </a>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td
                        align="center"
                        style={{ padding: "24px 8px", fontSize: 12, lineHeight: "20px", color: "#697c71" }}>
                        DADAKAEV CAL
                        <br />
                        <a
                          href="https://cal.apps.dadakaev.tech"
                          style={{ color: "#697c71", textDecoration: "none" }}>
                          cal.apps.dadakaev.tech
                        </a>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}
