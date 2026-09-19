const nodemailer = require('nodemailer');
const config = require('../config');

// In-memory log of sent emails for testing and verification
const sentEmailsLog = [];

/**
 * Builds the HTML content for subscription activation email
 */
function buildLicenseEmailHtml({ licenseKey, tier, downloadUrl }) {
  const tierName = tier.toUpperCase();
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background-color: #09090b; color: #f4f4f5; padding: 32px; border-radius: 16px; border: 1px solid #27272a;">
      <div style="text-align: center; margin-bottom: 28px;">
        <h1 style="color: #a78bfa; font-size: 24px; margin: 0 0 8px 0;">Reel Cutter</h1>
        <p style="color: #71717a; font-size: 14px; margin: 0;">Welcome to your ${tierName} subscription!</p>
      </div>

      <div style="background-color: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
        <p style="color: #a1a1aa; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 6px 0;">Your Plan</p>
        <h2 style="color: #ffffff; font-size: 18px; margin: 0 0 16px 0;">${tierName} — Monthly Subscription</h2>
        
        <p style="color: #a1a1aa; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0;">Your Activation Key</p>
        <div style="background-color: #09090b; border: 1px solid #3f3f46; border-radius: 8px; padding: 12px 16px; font-family: monospace; font-size: 18px; font-weight: bold; color: #c4b5fd; letter-spacing: 2px; text-align: center; margin-bottom: 16px;">
          ${licenseKey}
        </div>

        <p style="color: #71717a; font-size: 12px; margin: 0;">
          This key activates on one computer and binds to your hardware ID. Your subscription renews automatically each month.
        </p>
      </div>

      <div style="text-align: center; margin-bottom: 28px;">
        <a href="${downloadUrl}" style="background-color: #7c3aed; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: 600; font-size: 14px; display: inline-block;">
          Download Desktop Installer
        </a>
      </div>

      <div style="border-top: 1px solid #27272a; padding-top: 16px; text-align: center;">
        <p style="color: #52525b; font-size: 12px; margin: 0;">
          Need help? Contact support at support@reelcutter.app
        </p>
      </div>
    </div>
  `;
}

/**
 * Sends customer email containing license key, tier, and download link.
 *
 * @param {Object} params
 * @param {string} params.to Customer email address
 * @param {string} params.licenseKey Formatted license key (XXXX-XXXX-XXXX-XXXX)
 * @param {string} params.tier Purchased tier (basic, standard, pro)
 * @param {string} [params.downloadUrl] Download link override
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
async function sendLicenseEmail({ to, licenseKey, tier, downloadUrl }) {
  const targetEmail = to || 'customer@example.com';
  const finalDownloadUrl = downloadUrl || config.appDownloadUrl;

  const emailRecord = {
    to: targetEmail,
    licenseKey,
    tier,
    downloadUrl: finalDownloadUrl,
    sentAt: new Date().toISOString(),
  };

  sentEmailsLog.push(emailRecord);

  // If Resend API Key configured, use Resend API
  if (config.email.resendApiKey) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.email.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: config.email.from,
          to: [targetEmail],
          subject: `Your Reel Cutter (${tier.toUpperCase()}) License Key`,
          html: buildLicenseEmailHtml({ licenseKey, tier, downloadUrl: finalDownloadUrl }),
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.warn('[EmailService] Resend API error:', errBody);
        return { success: false, error: sanitizeErrorMessage(`Resend error: ${errBody}`) };
      } else {
        const data = await response.json();
        return { success: true, messageId: data.id };
      }
    } catch (err) {
      console.warn('[EmailService] Resend request failed:', err.message);
      return { success: false, error: sanitizeErrorMessage(`Resend network failure: ${err.message}`) };
    }
  }

  // If SMTP credentials configured, use Nodemailer SMTP
  if (config.email.smtp.host && config.email.smtp.user) {
    try {
      const transporter = nodemailer.createTransport({
        host: config.email.smtp.host,
        port: config.email.smtp.port,
        secure: config.email.smtp.port === 465,
        auth: {
          user: config.email.smtp.user,
          pass: config.email.smtp.pass,
        },
      });

      const info = await transporter.sendMail({
        from: config.email.from,
        to: targetEmail,
        subject: `Your Reel Cutter (${tier.toUpperCase()}) License Key`,
        html: buildLicenseEmailHtml({ licenseKey, tier, downloadUrl: finalDownloadUrl }),
      });

      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.warn('[EmailService] SMTP sendMail failed:', err.message);
      return { success: false, error: sanitizeErrorMessage(`SMTP failure: ${err.message}`) };
    }
  }

  // Fallback (or test environment): Captured in log
  return {
    success: true,
    messageId: `mock-msg-${Date.now()}`,
    captured: emailRecord,
  };
}

const MAX_EMAIL_ATTEMPTS = 3;

/**
 * Masks a customer email address for safe log output.
 * "customer@example.com" → "c***@example.com"
 *
 * @param {string} email
 * @returns {string}
 */
function maskEmail(email) {
  if (!email || typeof email !== 'string') return '[unknown]';
  const at = email.indexOf('@');
  if (at < 1) return '[masked]';
  return email.slice(0, 1) + '***' + email.slice(at);
}

/**
 * Sanitizes error messages to strip API keys, secrets, passwords, or auth headers.
 *
 * @param {Error|string} err
 * @returns {string}
 */
function sanitizeErrorMessage(err) {
  if (!err) return 'Unknown email delivery error';
  let msg = typeof err === 'string' ? err : (err.message || String(err));

  // Strip bearer tokens
  msg = msg.replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, 'Bearer [REDACTED]');
  // Strip common API key patterns (Resend, Stripe, Supabase)
  msg = msg.replace(/re_[a-zA-Z0-9_]+/g, '[REDACTED_KEY]');
  msg = msg.replace(/sk_[a-zA-Z0-9_]+/g, '[REDACTED_KEY]');
  msg = msg.replace(/whsec_[a-zA-Z0-9_]+/g, '[REDACTED_KEY]');
  // Strip password patterns
  msg = msg.replace(/password[:=]\s*[^,\s]+/gi, 'password=[REDACTED]');
  msg = msg.replace(/pass[:=]\s*[^,\s]+/gi, 'pass=[REDACTED]');

  // Bound length to prevent DB bloat
  if (msg.length > 500) {
    msg = msg.slice(0, 497) + '...';
  }
  return msg;
}

/**
 * Delivers license email and updates license record status in Supabase.
 *
 * @param {string} licenseId
 * @param {Object} [options]
 * @param {boolean} [options.simulateFailure] Test option to simulate a failure
 * @param {string} [options.failureMessage] Test option custom failure message
 * @param {string} [options.downloadUrl] Download URL override
 * @returns {Promise<{ success: boolean, email_status: 'sent'|'failed', email_attempts: number, email_sent_at?: string, error?: string, licenseId?: string, alreadySent?: boolean }>}
 */
async function deliverLicenseEmail(licenseId, options = {}) {
  const { getLicenseById, updateLicenseEmailStatus } = require('./licenseGenerator');
  const license = await getLicenseById(licenseId);
  if (!license) {
    return { success: false, error: 'License not found' };
  }

  if (license.email_status === 'sent') {
    return {
      success: true,
      alreadySent: true,
      email_status: 'sent',
      licenseId: license.id,
      email_attempts: license.email_attempts,
      email_sent_at: license.email_sent_at,
    };
  }

  const currentAttempts = (license.email_attempts || 0) + 1;
  const attemptTimestamp = new Date().toISOString();

  // Handle simulated failure for testing
  if (options.simulateFailure) {
    const sanitizedErr = sanitizeErrorMessage(options.failureMessage || 'Simulated provider error');
    await updateLicenseEmailStatus(license.id, {
      email_status: 'failed',
      email_error: sanitizedErr,
      email_attempts: currentAttempts,
      email_last_attempt_at: attemptTimestamp,
    });
    return {
      success: false,
      error: sanitizedErr,
      email_status: 'failed',
      email_attempts: currentAttempts,
      licenseId: license.id,
    };
  }

  const sendResult = await sendLicenseEmail({
    to: license.customer_email,
    licenseKey: license.license_key,
    tier: license.tier,
    downloadUrl: options.downloadUrl,
  });

  if (sendResult.success) {
    const sentTimestamp = new Date().toISOString();
    await updateLicenseEmailStatus(license.id, {
      email_status: 'sent',
      email_sent_at: sentTimestamp,
      email_error: null,
      email_attempts: currentAttempts,
      email_last_attempt_at: attemptTimestamp,
    });
    return {
      success: true,
      email_status: 'sent',
      email_sent_at: sentTimestamp,
      email_attempts: currentAttempts,
      licenseId: license.id,
      messageId: sendResult.messageId,
    };
  } else {
    const sanitizedErr = sanitizeErrorMessage(sendResult.error);
    await updateLicenseEmailStatus(license.id, {
      email_status: 'failed',
      email_error: sanitizedErr,
      email_attempts: currentAttempts,
      email_last_attempt_at: attemptTimestamp,
    });
    return {
      success: false,
      error: sanitizedErr,
      email_status: 'failed',
      email_attempts: currentAttempts,
      licenseId: license.id,
    };
  }
}

/**
 * Retries failed license email delivery up to MAX_EMAIL_ATTEMPTS.
 *
 * @param {string} licenseId
 * @param {Object} [options]
 * @returns {Promise<{ success: boolean, email_status: string, email_attempts: number, error?: string, maxAttemptsReached?: boolean, alreadySent?: boolean, licenseId?: string }>}
 */
async function retryLicenseEmail(licenseId, options = {}) {
  const { getLicenseById } = require('./licenseGenerator');
  const license = await getLicenseById(licenseId);
  if (!license) {
    return { success: false, error: 'License not found' };
  }

  if (license.email_status === 'sent') {
    return {
      success: false,
      alreadySent: true,
      error: 'Cannot retry: email is already sent',
      email_status: 'sent',
      licenseId: license.id,
      email_attempts: license.email_attempts,
    };
  }

  if ((license.email_attempts || 0) >= MAX_EMAIL_ATTEMPTS) {
    return {
      success: false,
      maxAttemptsReached: true,
      error: `Maximum delivery attempts (${MAX_EMAIL_ATTEMPTS}) reached`,
      email_status: license.email_status,
      licenseId: license.id,
      email_attempts: license.email_attempts,
    };
  }

  return deliverLicenseEmail(licenseId, options);
}

/**
 * Returns log of sent emails (for automated testing)
 */
function getSentEmails() {
  return [...sentEmailsLog];
}

/**
 * Clears the sent email log (for test cleanup)
 */
function clearSentEmails() {
  sentEmailsLog.length = 0;
}

module.exports = {
  sendLicenseEmail,
  deliverLicenseEmail,
  retryLicenseEmail,
  sanitizeErrorMessage,
  maskEmail,
  MAX_EMAIL_ATTEMPTS,
  buildLicenseEmailHtml,
  getSentEmails,
  clearSentEmails,
};
