// apps/server/src/token-blacklist.ts
// SQLite-backed token blacklist for immediate invalidation on logout/password change

import crypto from 'crypto';
import db from './db.js';
import logger from './logger.js';

// Create table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS token_blacklist (
    token_hash TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL
  )
`);
db.exec('CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires ON token_blacklist(expires_at)');

// Load unexpired entries into memory on startup
const blacklist = new Set<string>();
const expiryMap = new Map<string, number>();
const rows = db.prepare('SELECT token_hash, expires_at FROM token_blacklist WHERE expires_at > ?').all(Date.now()) as any[];
for (const row of rows) {
  blacklist.add(row.token_hash);
  expiryMap.set(row.token_hash, row.expires_at);
}
logger.info('[TOKEN-BLACKLIST] Loaded ' + rows.length + ' entries from DB');

/**
 * Add a token to the blacklist
 * @param tokenHash - SHA256 hash of the JWT token
 * @param expiresAt - Token expiration timestamp in ms
 */
export function blacklistToken(tokenHash: string, expiresAt: number): void {
  blacklist.add(tokenHash);
  expiryMap.set(tokenHash, expiresAt);
  try {
    db.prepare('INSERT OR REPLACE INTO token_blacklist (token_hash, expires_at) VALUES (?, ?)').run(tokenHash, expiresAt);
  } catch (e) {
    logger.error('[TOKEN-BLACKLIST] Failed to persist token:', e);
  }
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
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Clean up expired tokens from the blacklist
 * Should be called periodically (e.g., every hour)
 */
export function cleanupBlacklist(): void {
  const now = Date.now();
  const toDelete: string[] = [];
  for (const [hash, expiresAt] of expiryMap) {
    if (expiresAt <= now) {
      blacklist.delete(hash);
      expiryMap.delete(hash);
      toDelete.push(hash);
    }
  }
  if (toDelete.length > 0) {
    try {
      const stmt = db.prepare('DELETE FROM token_blacklist WHERE token_hash = ?');
      for (const hash of toDelete) stmt.run(hash);
    } catch (e) {
      logger.error('[TOKEN-BLACKLIST] Failed to cleanup DB entries:', e);
    }
  }
}

// Auto-cleanup every hour
setInterval(cleanupBlacklist, 60 * 60 * 1000);
