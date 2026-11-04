import argon2 from 'argon2';

const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 64 * 1024, timeCost: 3, parallelism: 4 }; // 64 MB

export const hashPassword = (plainPassword) => argon2.hash(plainPassword, ARGON2_OPTIONS);

let timingEqualizerHash;

/**
 * Checks a password against an admin account. When the account does not exist we still verify against a dummy
 * hash, so the response time does not reveal which email addresses are valid.
 */
export async function verifyAdminPassword(admin, plainPassword) {
  timingEqualizerHash ??= await hashPassword('timing-equalizer');
  const isPasswordCorrect = await argon2.verify(admin?.passwordHash ?? timingEqualizerHash, plainPassword);
  return Boolean(admin) && isPasswordCorrect;
}
