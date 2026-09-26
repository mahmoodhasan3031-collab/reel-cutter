/**
 * Generates a scrypt hash for ADMIN_PASSWORD_HASH.
 *
 * Usage:
 *   node server/scripts/generateAdminPasswordHash.js "your-strong-password"
 *
 * The plaintext password is only used to compute the hash — never commit it
 * or place it in .env. Put ONLY the printed scrypt$... value in .env.
 */

const { hashPassword } = require('../services/adminAuth');

const password = process.argv[2];

if (!password) {
  console.error('Usage: node server/scripts/generateAdminPasswordHash.js "<password>"');
  process.exit(1);
}

console.log(hashPassword(password));
