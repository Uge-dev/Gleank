import nodemailer from "nodemailer";
import { env } from "../config/env.js";

let transporterPromise = null;

function isSmtpConfigured() {
  return Boolean(env.smtpHost && env.smtpUser && env.smtpPass);
}

function getFromAddress() {
  const name = String(env.smtpFromName || "Gleank").replace(/[<>]/g, "").trim();
  const email = String(env.smtpFromEmail || env.smtpUser || "no-reply@gleank.local").trim();
  return name ? `"${name}" <${email}>` : email;
}

async function getTransporter() {
  if (!isSmtpConfigured()) {
    return null;
  }

  if (!transporterPromise) {
    transporterPromise = Promise.resolve(
      nodemailer.createTransport({
        host: env.smtpHost,
        port: env.smtpPort,
        secure: env.smtpSecure,
        auth: {
          user: env.smtpUser,
          pass: env.smtpPass,
        },
        logger: env.smtpDebug,
        debug: env.smtpDebug,
      }),
    );
  }

  return transporterPromise;
}

export function buildFrontendUrl(path) {
  const base = env.frontendUrl.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function emailShell({ title, preview, body, ctaText, ctaUrl, footer }) {
  const safeTitle = escapeHtml(title);
  const safePreview = escapeHtml(preview);
  const safeBody = escapeHtml(body);
  const safeCtaText = escapeHtml(ctaText);
  const safeCtaUrl = escapeHtml(ctaUrl);
  const safeFooter = escapeHtml(footer);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
  </head>
  <body style="margin:0;background:#f6f8fb;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${safePreview}</span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f8fb;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="padding:28px 28px 12px;background:#07111f;color:#ffffff;">
                <div style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#fb923c;font-weight:700;">Gleank</div>
                <h1 style="margin:12px 0 0;font-size:26px;line-height:1.25;">${safeTitle}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 20px;font-size:16px;line-height:1.65;color:#374151;">${safeBody}</p>
                <a href="${safeCtaUrl}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:12px;font-weight:700;font-size:15px;">${safeCtaText}</a>
                <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#6b7280;">If the button does not work, copy and paste this link into your browser:<br />
                  <a href="${safeCtaUrl}" style="color:#2563eb;word-break:break-all;">${safeCtaUrl}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 28px;color:#6b7280;font-size:12px;line-height:1.6;border-top:1px solid #eef2f7;">${safeFooter}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendMail({ to, subject, text, html }) {
  const transporter = await getTransporter();

  if (!transporter) {
    const message = "SMTP email is not configured. Add SMTP_HOST, SMTP_USER, SMTP_PASS, and sender details in Backend/.env.";

    if (env.isProduction) {
      throw new Error(message);
    }

    console.warn(`[Gleank email warning] ${message}`);
    console.log(`[Gleank email fallback] To: ${to}`);
    console.log(`[Gleank email fallback] Subject: ${subject}`);
    console.log(text);
    return { delivered: false, mode: "console" };
  }

  const info = await transporter.sendMail({
    from: getFromAddress(),
    to,
    subject,
    text,
    html,
  });

  if (!env.isProduction || env.smtpDebug) {
    console.log(`[Gleank email sent] ${subject} -> ${to} (${info.messageId || "no-message-id"})`);
  }

  return { delivered: true, messageId: info.messageId };
}

export async function sendEmailVerificationEmail({ to, name, token }) {
  const verificationUrl = buildFrontendUrl(`/verify-email?token=${encodeURIComponent(token)}`);
  const displayName = name || "there";
  const subject = "Verify your Gleank email address";
  const body = `Hi ${displayName}, please verify your email address to activate your Gleank account and continue using protected buyer, seller, order, chat, and used-market features.`;
  const footer = "This verification link expires soon. If you did not create a Gleank account, you can safely ignore this email.";

  const text = `${body}\n\nVerify your email: ${verificationUrl}\n\n${footer}`;
  const html = emailShell({
    title: "Verify your email",
    preview: "Complete your Gleank signup by verifying your email address.",
    body,
    ctaText: "Verify Email",
    ctaUrl: verificationUrl,
    footer,
  });

  const result = await sendMail({ to, subject, text, html });
  return { ...result, verificationUrl };
}

export async function sendPasswordResetEmail({ to, name, token }) {
  const resetUrl = buildFrontendUrl(`/forgot-password?token=${encodeURIComponent(token)}`);
  const displayName = name || "there";
  const subject = "Reset your Gleank password";
  const body = `Hi ${displayName}, use this secure link to reset your Gleank password. If you did not request a reset, ignore this email and your password will remain unchanged.`;
  const footer = "This password reset link expires soon for your account security.";

  const text = `${body}\n\nReset your password: ${resetUrl}\n\n${footer}`;
  const html = emailShell({
    title: "Reset your password",
    preview: "Use this secure Gleank link to reset your password.",
    body,
    ctaText: "Reset Password",
    ctaUrl: resetUrl,
    footer,
  });

  const result = await sendMail({ to, subject, text, html });
  return { ...result, resetUrl };
}
