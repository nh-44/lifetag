/**
 * Prints the PUBLIC half of AUTHORITY_PRIVATE_KEY (from server/.env) in the form the
 * client expects for its offline trust anchor. The private key is never printed.
 *
 *   cd server && npx ts-node scripts/print-authority-public-key.ts
 *
 * Paste the output into client/.env as VITE_AUTHORITY_PUBLIC_KEYS and rebuild the
 * client. To rotate keys, keep the old public key in the array until every tag it
 * certified has been re-issued, and list it server-side in AUTHORITY_TRUSTED_PUBLIC_KEYS.
 */
import path from 'path';
import dotenv from 'dotenv';
import { CryptoUtils } from '../src/utils/crypto.utils';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const jwk = CryptoUtils.getAuthorityPublicJwk();
if (!jwk) {
  console.error('AUTHORITY_PRIVATE_KEY is missing or invalid in server/.env');
  process.exit(1);
}
console.log(`VITE_AUTHORITY_PUBLIC_KEYS='${JSON.stringify([{ x: jwk.x, y: jwk.y }])}'`);
