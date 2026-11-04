import crypto from 'crypto';

/**
 * AegisTag Server-Side Cryptographic utilities
 * Handles classic ECDSA P-256 signature verification and simulated Kyber-768 KEM key encapsulation.
 */
export class CryptoUtils {
  /**
   * Verifies an ECDSA P-256 signature against stringified triage data
   */
  static verifyEcdsaSignature(
    triageData: unknown,
    signatureBase64: string,
    publicKeyJwk: object
  ): boolean {
    try {
      // Import public key from JWK object
      const publicKey = crypto.createPublicKey({
        key: publicKeyJwk,
        format: 'jwk',
      });

      const dataBuffer = typeof triageData === 'string'
        ? Buffer.from(triageData, 'utf8')
        : Buffer.from(JSON.stringify(triageData));
      const signatureBuffer = Buffer.from(signatureBase64, 'base64');

      // The Web Crypto API (used by the real browser client) always produces/expects
      // raw IEEE P1363 signatures (r||s, 64 bytes for P-256), not Node's default DER
      // encoding. Signatures verified here originate either from the patient's browser
      // (Web Crypto) or from signWithAuthorityKey below (also P1363) — both sides must
      // agree on this encoding or genuine signatures fail verification.
      return crypto.verify(
        'sha256',
        dataBuffer,
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        signatureBuffer
      );
    } catch (e) {
      console.error('ECDSA verification failed on server:', e);
      return false;
    }
  }

  /**
   * Kyber-768 Post-Quantum Key Encapsulation Mechanism (Simulation)
   * Provides the programmatic construct for benchmarking post-quantum handshakes.
   */
  static generateKyberKeyPair(): { publicKey: string; privateKey: string } {
    const rawSeed = crypto.randomBytes(32).toString('hex');
    return {
      publicKey: `KYBER-768-PUB-${rawSeed.substring(0, 24).toUpperCase()}`,
      privateKey: `KYBER-768-PRI-${rawSeed.substring(24).toUpperCase()}`,
    };
  }

  /**
   * Encapsulates a shared secret using the Kyber public key
   */
  static encapsulateSharedSecret(_kyberPublicKey: string): {
    ciphertext: string;
    sharedSecret: string;
  } {
    const secret = crypto.randomBytes(32).toString('hex');
    const cipherSeed = crypto.randomBytes(16).toString('hex');
    return {
      ciphertext: `KYBER-CIPHER-${cipherSeed.toUpperCase()}`,
      sharedSecret: secret,
    };
  }

  /**
   * Decapsulates a shared secret using the Kyber private key and ciphertext
   */
  static decapsulateSharedSecret(
    ciphertext: string,
    kyberPrivateKey: string
  ): string {
    // Simulates recovering the matching 32-byte shared secret key
    const hashedKey = crypto
      .createHash('sha256')
      .update(ciphertext + kyberPrivateKey)
      .digest('hex');
    return hashedKey;
  }

  /**
   * Signs `data` with the Healthcare Authority's ECDSA P-256 private key (AUTHORITY_PRIVATE_KEY).
   * Throws rather than returning an empty signature: a failed certification must never be
   * written to a tag or stored as if it succeeded.
   */
  static signWithAuthorityKey(data: string): string {
    if (!process.env.AUTHORITY_PRIVATE_KEY) {
      throw new Error(
        'AUTHORITY_PRIVATE_KEY is not set. Generate an ECDSA P-256 key pair and add it to your .env file. See .env.example for instructions.'
      );
    }

    const privateKey = crypto.createPrivateKey({
      key: JSON.parse(process.env.AUTHORITY_PRIVATE_KEY),
      format: 'jwk',
    });

    // Signed as raw IEEE P1363 (not Node's default DER) so the client's Web Crypto
    // subtle.verify() — which only accepts P1363 — can validate this signature
    // entirely offline. See the matching note in verifyEcdsaSignature above.
    const signature = crypto.sign('sha256', Buffer.from(data, 'utf8'), {
      key: privateKey,
      dsaEncoding: 'ieee-p1363',
    });
    return signature.toString('base64');
  }

  /**
   * Public half of AUTHORITY_PRIVATE_KEY, or null if it is unset/invalid. This is the value
   * the client must embed as its offline trust anchor (see scripts/print-authority-public-key.ts).
   */
  static getAuthorityPublicJwk(): crypto.webcrypto.JsonWebKey | null {
    if (!process.env.AUTHORITY_PRIVATE_KEY) return null;
    try {
      const privateKey = crypto.createPrivateKey({
        key: JSON.parse(process.env.AUTHORITY_PRIVATE_KEY),
        format: 'jwk',
      });
      const { kty, crv, x, y } = crypto.createPublicKey(privateKey).export({ format: 'jwk' });
      return { kty, crv, x, y };
    } catch (e) {
      console.error('AUTHORITY_PRIVATE_KEY could not be parsed as a P-256 JWK:', e);
      return null;
    }
  }
}
