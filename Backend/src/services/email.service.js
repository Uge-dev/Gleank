import nodemailer from "nodemailer";
import { env } from "../config/env.js";

let transporter;

export function buildFrontendUrl(path) {
  const base = env.frontendUrl.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function isSmtpConfigured() {
  return Boolean(env.smtpHost && env.smtpUser && env.smtpPass);
}

function getTransporter() {
  if (!isSmtpConfigured()) {
    throw new Error(
      "SMTP is not configured. Add SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM_EMAIL to Backend/.env.",
    );
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPass,
      },
      logger: env.smtpDebug,
      debug: env.smtpDebug,
    });
  }

  return transporter;
}

function fromAddress() {
  const name = String(env.smtpFromName || "Gleank").replace(/[<>]/g, "").trim();
  const email = String(env.smtpFromEmail || env.smtpUser).trim();
  return name ? `"${name}" <${email}>` : email;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function emailTemplate({ title, preview, name, body, ctaText, ctaUrl }) {
  const safeTitle = escapeHtml(title);
  const safePreview = escapeHtml(preview);
  const safeName = escapeHtml(name || "there");
  const safeBody = escapeHtml(body);
  const safeCtaText = escapeHtml(ctaText);
  const safeCtaUrl = escapeHtml(ctaUrl);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle}</title>
  </head>
  <body style="margin:0;background:#f4f7f2;font-family:Arial,sans-serif;color:#132018;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${safePreview}</div>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f7f2;padding:32px 16px;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #dfe8dd;">
            <tr>
              <td style="padding:28px 28px 12px;text-align:center;">
                <div style="font-size:28px;font-weight:800;color:#3c9a41;letter-spacing:-0.04em;">Gleank</div>
                <p style="margin:8px 0 0;color:#64806a;font-size:14px;">Campus marketplace account security</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 34px;">
                <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;color:#101827;">${safeTitle}</h1>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#526176;">Hi ${safeName},</p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#526176;">${safeBody}</p>
                <p style="margin:0 0 24px;text-align:center;">
                  <a href="${safeCtaUrl}" style="display:inline-block;background:#3c9a41;color:#ffffff;text-decoration:none;border-radius:999px;padding:14px 24px;font-size:15px;font-weight:700;">${safeCtaText}</a>
                </p>
                <p style="margin:0;color:#718096;font-size:13px;line-height:1.6;">If the button does not work, copy and paste this link into your browser:</p>
                <p style="word-break:break-all;margin:8px 0 0;color:#3c9a41;font-size:13px;line-height:1.6;">${safeCtaUrl}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendMail({ to, subject, html, text }) {
  const mailer = getTransporter();
  return mailer.sendMail({
    from: fromAddress(),
    to,
    subject,
    html,
    text,
  });
}

export async function sendEmailVerificationEmail({ to, name, token }) {
  const verificationUrl = buildFrontendUrl(
    `/verify-email?token=${encodeURIComponent(token)}`,
  );

  await sendMail({
    to,
    subject: "Verify your Gleank email address",
    text: `Hi ${name || "there"}, verify your Gleank account using this link: ${verificationUrl}`,
    html: emailTemplate({
      title: "Verify your email",
      preview: "Confirm your Gleank account email address.",
      name,
      body:
        "Please confirm your email address so you can access protected Gleank features like checkout, messages, orders, profile tools, seller tools, and used-market submissions.",
      ctaText: "Verify email",
      ctaUrl: verificationUrl,
    }),
  });

  return { verificationUrl };
}

export async function sendPasswordResetEmail({ to, name, token }) {
  const resetUrl = buildFrontendUrl(
    `/forgot-password?token=${encodeURIComponent(token)}`,
  );

  await sendMail({
    to,
    subject: "Reset your Gleank password",
    text: `Hi ${name || "there"}, reset your Gleank password using this link: ${resetUrl}`,
    html: emailTemplate({
      title: "Reset your password",
      preview: "Reset your Gleank account password.",
      name,
      body:
        "We received a request to reset your password. Use the secure link below to choose a new password. If you did not request this, you can ignore this email.",
      ctaText: "Reset password",
      ctaUrl: resetUrl,
    }),
  });

  return { resetUrl };
}
