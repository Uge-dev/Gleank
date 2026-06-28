import { db } from "../db/database.js";

export function findUserByEmail(email) {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email);
}

export function findUserById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

export function createUser(user) {
  db.prepare(`
    INSERT INTO users (
      id, name, email, password_hash, role, campus, phone,
      email_verified, email_verified_at, phone_verified, phone_verified_at,
      failed_login_count, locked_until, last_login_at, last_password_change_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 0, NULL, NULL, ?, ?, ?)
  `).run(
    user.id,
    user.name,
    user.email,
    user.passwordHash,
    user.role,
    user.campus,
    user.phone,
    user.emailVerified ? 1 : 0,
    user.emailVerifiedAt || null,
    user.lastPasswordChangeAt || user.createdAt,
    user.createdAt,
    user.updatedAt,
  );

  return findUserById(user.id);
}

export function updateUser(id, updates) {
  db.prepare(`
    UPDATE users
    SET name = ?, campus = ?, phone = ?, updated_at = ?
    WHERE id = ?
  `).run(updates.name, updates.campus, updates.phone, updates.updatedAt, id);

  return findUserById(id);
}

export function updateUserPassword(id, passwordHash, updatedAt) {
  db.prepare(`
    UPDATE users
    SET password_hash = ?, last_password_change_at = ?, updated_at = ?
    WHERE id = ?
  `).run(passwordHash, updatedAt, updatedAt, id);
}

export function markUserEmailVerified(id, verifiedAt) {
  db.prepare(`
    UPDATE users
    SET email_verified = 1, email_verified_at = ?, updated_at = ?
    WHERE id = ?
  `).run(verifiedAt, verifiedAt, id);

  return findUserById(id);
}

export function recordSuccessfulLogin(id, loggedInAt) {
  db.prepare(`
    UPDATE users
    SET failed_login_count = 0, locked_until = NULL, last_login_at = ?, updated_at = ?
    WHERE id = ?
  `).run(loggedInAt, loggedInAt, id);
}

export function recordFailedLogin(id, failedCount, lockedUntil, updatedAt) {
  db.prepare(`
    UPDATE users
    SET failed_login_count = ?, locked_until = ?, updated_at = ?
    WHERE id = ?
  `).run(failedCount, lockedUntil, updatedAt, id);
}
