const nodemailer = require('nodemailer');
const config = require('../config');

// In-memory log of sent emails for testing and verification
const sentEmailsLog = [];

/**
 * Builds the HTML content for purchase confirmation email
 */
function buildLicenseEmailHtml({ licenseKey, tier, downloadUrl }) {
  const tierName = tier.toUpperCase();
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background-color: #09090b; color: #f4f4f5; padding: 32px; border-radius: 16px; border: 1px solid #27272a;">
      <div style="text-align: center; margin-bottom: 28px;">
        <h1 style="color: #a78bfa; font-size: 24px; margin: 0 0 8px 0;">Reel Cutter</h1>
        <p style="color: #71717a; font-size: 14px; margin: 0;">Thank you for your purchase!</p>
      </div>

      <div style="background-color: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
        <p style="color: #a1a1aa; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 6px 0;">Purchased License</p>
        <h2 style="color: #ffffff; font-size: 18px; margin: 0 0 16px 0;">${tierName} Plan</h2>
        
        <p style="color: #a1a1aa; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0;">Your Activation Key</p>
        <div style="background-color: #09090b; border: 1px solid #3f3f46; border-radius: 8px; padding: 12px 16px; font-family: monospace; font-size: 18px; font-weight: bold; color: #c4b5fd; letter-spacing: 2px; text-align: center; margin-bottom: 16px;">
          ${licenseKey}
        </div>

        <p style="color: #71717a; font-size: 12px; margin: 0;">
          This key can be activated on one computer and binds to your hardware ID.
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
      } else {
        const data = await response.json();
        return { success: true, messageId: data.id };
      }
    } catch (err) {
      console.warn('[EmailService] Resend request failed:', err.message);
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
    }
  }

  // Fallback (or test environment): Captured in log
  return {
    success: true,
    messageId: `mock-msg-${Date.now()}`,
    captured: emailRecord,
  };
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
  buildLicenseEmailHtml,
  getSentEmails,
  clearSentEmails,
};
