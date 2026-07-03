import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { HttpError } from "../lib/http-error.js";

export function buildFrontendUrl(path) {
  const base = env.frontendUrl.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function assertEmailConfigured() {
  if (shouldUseBrevoApi()) {
    if (!env.brevoApiKey || !senderParts().email) {
      throw new HttpError(
        500,
        "Brevo API email delivery is not configured. Add BREVO_API_KEY and EMAIL_FROM or SMTP_FROM_EMAIL.",
      );
    }
    return;
  }

  if (!env.smtpHost || !env.smtpUser || !env.smtpPass || !fromAddress()) {
    throw new HttpError(
      500,
      "Email delivery is not configured. Add Brevo SMTP values to Backend/.env.",
    );
  }
}

function fromAddress() {
  if (env.emailFrom) return env.emailFrom;
  if (env.smtpFromEmail) {
    const safeName = String(env.smtpFromName || "Gleank").replace(/[<>]/g, "").trim();
    return safeName ? `"${safeName}" <${env.smtpFromEmail}>` : env.smtpFromEmail;
  }
  return "";
}

function configuredProvider() {
  if (["brevo", "brevo-api", "api"].includes(env.emailProvider)) return "brevo-api";
  if (env.emailProvider === "smtp") return "smtp";
  return env.brevoApiKey ? "brevo-api" : "smtp";
}

function shouldUseBrevoApi() {
  return configuredProvider() === "brevo-api";
}

function senderParts() {
  const raw = fromAddress();
  const match = raw.match(/^(.*?)<([^>]+)>$/);

  if (match) {
    const name = match[1].replace(/^["']|["']$/g, "").trim();
    return {
      name: name || env.smtpFromName || "Gleank",
      email: match[2].trim(),
    };
  }

  return {
    name: env.smtpFromName || "Gleank",
    email: raw.trim(),
  };
}

function preview(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 8) return "configured";
  return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

export function getEmailConfigReport() {
  const sender = fromAddress();

  return {
    provider: configuredProvider(),
    brevoApiKeyPresent: Boolean(env.brevoApiKey),
    smtpHostPresent: Boolean(env.smtpHost),
    smtpHost: env.smtpHost || "",
    smtpPort: env.smtpPort,
    smtpSecure: env.smtpSecure,
    smtpUserPresent: Boolean(env.smtpUser),
    smtpUserPreview: preview(env.smtpUser),
    smtpPassPresent: Boolean(env.smtpPass),
    senderPresent: Boolean(sender),
    senderPreview: preview(sender),
    frontendUrl: env.frontendUrl,
    production: env.isProduction,
  };
}

let transporter = null;

function getTransporter() {
  assertEmailConfigured();

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      connectionTimeout: 8_000,
      greetingTimeout: 8_000,
      socketTimeout: 12_000,
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

async function brevoApiRequest(path, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(`https://api.brevo.com/v3${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "api-key": env.brevoApiKey,
        ...(init.headers || {}),
      },
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new HttpError(
        response.status || 502,
        body.message || "Brevo API request failed.",
        body,
      );
    }

    return body;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new HttpError(504, "Brevo API request timed out.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendBrevoApiEmail({ to, subject, text, html }) {
  assertEmailConfigured();
  const sender = senderParts();

  const body = await brevoApiRequest("/smtp/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html,
    }),
  });

  return {
    sent: true,
    development: false,
    provider: "brevo-api",
    accepted: [to],
    rejected: [],
    response: body.messageId || "Brevo API accepted the message.",
    messageId: body.messageId || "",
  };
}

async function sendTransactionalEmail({ to, subject, text, html }) {
  if (shouldUseBrevoApi()) {
    if (!env.brevoApiKey || !senderParts().email) {
      if (env.isProduction) {
        assertEmailConfigured();
      }

      console.info(
        `[email:development] ${subject} -> ${to}\n${text || html || ""}`,
      );

      return { sent: false, development: true, provider: "brevo-api" };
    }

    return sendBrevoApiEmail({ to, subject, text, html });
  }

  if (!env.smtpHost || !env.smtpUser || !env.smtpPass || !fromAddress()) {
    if (env.isProduction) {
      assertEmailConfigured();
    }

    console.info(
      `[email:development] ${subject} -> ${to}\n${text || html || ""}`,
    );

    return { sent: false, development: true };
  }

  const mailer = getTransporter();

  const info = await mailer.sendMail({
    from: fromAddress(),
    to,
    subject,
    text,
    html,
  });

  return {
    sent: true,
    development: false,
    provider: "smtp",
    accepted: info.accepted || [],
    rejected: info.rejected || [],
    response: info.response || "",
    messageId: info.messageId || "",
  };
}

export async function verifyEmailTransport() {
  if (shouldUseBrevoApi()) {
    assertEmailConfigured();
    await brevoApiRequest("/account", { method: "GET" });

    return {
      ok: true,
      provider: "brevo-api",
      checkedAt: new Date().toISOString(),
    };
  }

  const mailer = getTransporter();
  await mailer.verify();

  return {
    ok: true,
    provider: "smtp",
    checkedAt: new Date().toISOString(),
  };
}

export async function sendDiagnosticEmail({ to }) {
  return sendTransactionalEmail({
    to,
    subject: "Gleank email delivery diagnostic",
    text: `This is a Gleank email diagnostic sent at ${new Date().toISOString()}.

If you received this email, the deployed backend can connect to Brevo and deliver transactional emails.`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;background:#f8fafc;padding:28px;color:#0f172a;">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:22px;padding:28px;">
          <p style="margin:0 0 10px;color:#16a34a;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">Gleank diagnostic</p>
          <h1 style="margin:0 0 12px;font-size:26px;line-height:1.15;color:#020617;">Email delivery is connected</h1>
          <p style="margin:0;color:#475569;font-size:15px;line-height:1.6;">This message confirms that the deployed Gleank backend can connect to Brevo and send transactional emails.</p>
        </div>
      </div>
    `,
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

Recovery code:
${token}

This link expires soon. If you did not request a password reset, ignore this email.`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;background:#f8fafc;padding:28px;color:#0f172a;">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:22px;padding:28px;">
          <p style="margin:0 0 10px;color:#16a34a;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">Gleank security</p>
          <h1 style="margin:0 0 12px;font-size:26px;line-height:1.15;color:#020617;">Reset your password</h1>
          <p style="margin:0 0 18px;color:#475569;font-size:15px;line-height:1.6;">Hello ${safeName}, use this secure link to choose a new password for your Gleank account.</p>
          <a href="${resetUrl}" style="display:inline-flex;align-items:center;justify-content:center;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:14px;padding:14px 20px;font-weight:800;">Reset password</a>
          <p style="margin:22px 0 8px;color:#334155;font-size:13px;font-weight:800;">Recovery code</p>
          <p style="margin:0;color:#0f172a;background:#f1f5f9;border-radius:14px;padding:12px;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;">${escapeHtml(token)}</p>
          <p style="margin:22px 0 0;color:#64748b;font-size:13px;line-height:1.5;">If the button does not work, copy and paste this link into your browser:<br>${resetUrl}</p>
        </div>
      </div>
    `,
  });

  return { sent: true };
}
