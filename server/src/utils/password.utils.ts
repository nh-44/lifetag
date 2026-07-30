import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export const hashPassword = async (plain: string): Promise<string> => {
  return await bcrypt.hash(plain, SALT_ROUNDS);
};

export const verifyPassword = async (plain: string, hash: string): Promise<boolean> => {
  return await bcrypt.compare(plain, hash);
};
