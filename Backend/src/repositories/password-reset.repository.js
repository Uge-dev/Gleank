import { db } from "../db/database.js";

export function deletePasswordResetsForUser(userId) {
  db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").run(userId);
}

export function createPasswordReset(reset) {
  db.prepare(`
    INSERT INTO password_reset_tokens (
      id, user_id, token_hash, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?)
  `).run(
    reset.id,
    reset.userId,
    reset.tokenHash,
    reset.expiresAt,
    reset.createdAt,
  );
}

export function findPasswordResetByTokenHash(tokenHash) {
  return db
    .prepare("SELECT * FROM password_reset_tokens WHERE token_hash = ?")
    .get(tokenHash);
}

export function markPasswordResetUsed(id, usedAt) {
  db.prepare(`
    UPDATE password_reset_tokens
    SET used_at = ?
    WHERE id = ?
  `).run(usedAt, id);
}
