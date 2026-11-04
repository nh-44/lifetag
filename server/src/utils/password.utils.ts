import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export const hashPassword = async (plain: string): Promise<string> => {
  return await bcrypt.hash(plain, SALT_ROUNDS);
};

export const verifyPassword = async (plain: string, hash: string): Promise<boolean> => {
  return await bcrypt.compare(plain, hash);
};

let dummyHash: Promise<string> | null = null;

/**
 * Runs a real bcrypt comparison (same cost as stored hashes) against a throwaway hash.
 * Used when a login names an unknown account, so timing doesn't reveal which IDs exist.
 */
export const verifyAgainstDummy = async (plain: string): Promise<false> => {
  dummyHash ||= bcrypt.hash(crypto.randomBytes(16).toString('hex'), SALT_ROUNDS);
  await bcrypt.compare(plain, await dummyHash);
  return false;
};
