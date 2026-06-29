import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { HttpError } from "../lib/http-error.js";

export function buildFrontendUrl(path) {
  const base = env.frontendUrl.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function assertEmailConfigured() {
  if (!env.smtpHost || !env.smtpUser || !env.smtpPass || !env.emailFrom) {
    throw new HttpError(
      500,
      "Email delivery is not configured. Add Brevo SMTP values to Backend/.env.",
    );
  }
}

let transporter = null;

function getTransporter() {
  assertEmailConfigured();

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPass,
      },
    });
  }

  return transporter;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendTransactionalEmail({ to, subject, text, html }) {
  const mailer = getTransporter();

  await mailer.sendMail({
    from: env.emailFrom,
    to,
    subject,
    text,
    html,
  });
}

export async function sendEmailVerificationEmail({ to, name, token }) {
  const verificationUrl = buildFrontendUrl(`/verify-email?token=${encodeURIComponent(token)}`);
  const safeName = escapeHtml(name || "there");

  await sendTransactionalEmail({
    to,
    subject: "Verify your Gleank account",
    text: `Hello ${name || "there"},

Verify your Gleank account by opening this link:
${verificationUrl}

This link expires soon. If you did not create a Gleank account, ignore this email.`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;background:#f8fafc;padding:28px;color:#0f172a;">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:22px;padding:28px;">
          <p style="margin:0 0 10px;color:#16a34a;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">Gleank verification</p>
          <h1 style="margin:0 0 12px;font-size:26px;line-height:1.15;color:#020617;">Verify your email</h1>
          <p style="margin:0 0 18px;color:#475569;font-size:15px;line-height:1.6;">Hello ${safeName}, confirm this email address to secure your Gleank account and unlock protected actions.</p>
          <a href="${verificationUrl}" style="display:inline-flex;align-items:center;justify-content:center;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:14px;padding:14px 20px;font-weight:800;">Verify email</a>
          <p style="margin:22px 0 0;color:#64748b;font-size:13px;line-height:1.5;">If the button does not work, copy and paste this link into your browser:<br>${verificationUrl}</p>
        </div>
      </div>
    `,
  });

  return { sent: true };
}

export async function sendPasswordResetEmail({ to, name, token }) {
  const resetUrl = buildFrontendUrl(`/forgot-password?token=${encodeURIComponent(token)}`);
  const safeName = escapeHtml(name || "there");

  await sendTransactionalEmail({
    to,
    subject: "Reset your Gleank password",
    text: `Hello ${name || "there"},

Reset your Gleank password by opening this link:
${resetUrl}

This link expires soon. If you did not request a password reset, ignore this email.`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;background:#f8fafc;padding:28px;color:#0f172a;">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:22px;padding:28px;">
          <p style="margin:0 0 10px;color:#16a34a;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">Gleank security</p>
          <h1 style="margin:0 0 12px;font-size:26px;line-height:1.15;color:#020617;">Reset your password</h1>
          <p style="margin:0 0 18px;color:#475569;font-size:15px;line-height:1.6;">Hello ${safeName}, use this secure link to choose a new password for your Gleank account.</p>
          <a href="${resetUrl}" style="display:inline-flex;align-items:center;justify-content:center;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:14px;padding:14px 20px;font-weight:800;">Reset password</a>
          <p style="margin:22px 0 0;color:#64748b;font-size:13px;line-height:1.5;">If the button does not work, copy and paste this link into your browser:<br>${resetUrl}</p>
        </div>
      </div>
    `,
  });

  return { sent: true };
}
