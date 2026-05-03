// Produce a better-auth-signed cookie value for a raw session token.
// Usage: BETTER_AUTH_SECRET=... node sign-cookie.js <token>
const crypto = require("crypto");
const token = process.argv[2];
const secret = process.env.BETTER_AUTH_SECRET;
if (!token || !secret) {
  console.error("usage: BETTER_AUTH_SECRET=<secret> node sign-cookie.js <token>");
  process.exit(1);
}
const sig = crypto.createHmac("sha256", secret).update(token).digest("base64");
process.stdout.write(encodeURIComponent(`${token}.${sig}`));
