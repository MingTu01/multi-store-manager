// apps/server/src/token-blacklist.ts
// In-memory token blacklist for immediate invalidation on logout/password change

const blacklist = new Set<string>();
const expiryMap = new Map<string, number>();

/**
 * Add a token to the blacklist
 * @param tokenHash - SHA256 hash of the JWT token
 * @param expiresAt - Token expiration timestamp in ms
 */
export function blacklistToken(tokenHash: string, expiresAt: number): void {
  blacklist.add(tokenHash);
  expiryMap.set(tokenHash, expiresAt);
}

/**
 * Check if a token is blacklisted
 * @param tokenHash - SHA256 hash of the JWT token
 */
export function isTokenBlacklisted(tokenHash: string): boolean {
  return blacklist.has(tokenHash);
}

/**
 * Generate SHA256 hash of a token for blacklist storage
 */
export function hashToken(token: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Clean up expired tokens from the blacklist
 * Should be called periodically (e.g., every hour)
 */
export function cleanupBlacklist(): void {
  const now = Date.now();
  for (const [hash, expiresAt] of expiryMap) {
    if (expiresAt <= now) {
      blacklist.delete(hash);
      expiryMap.delete(hash);
    }
  }
}

// Auto-cleanup every hour
setInterval(cleanupBlacklist, 60 * 60 * 1000);
