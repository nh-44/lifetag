import crypto from 'crypto';

/**
 * LifeTag Server-Side Cryptographic utilities
 * Handles classic ECDSA P-256 signature verification and simulated Kyber-768 KEM key encapsulation.
 */
export class CryptoUtils {
  /**
   * Verifies an ECDSA P-256 signature against stringified triage data
   */
  static verifyEcdsaSignature(
    triageData: any,
    signatureBase64: string,
    publicKeyJwk: any
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

      return crypto.verify(
        'sha256',
        dataBuffer,
        publicKey,
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
  static encapsulateSharedSecret(kyberPublicKey: string): {
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
   * Generates a real ECDSA P-256 Authority Signature certifying the patient's public key.
   * Loads the private key from the environment variable AUTHORITY_PRIVATE_KEY, falling back to development JWK.
   */
  static signWithAuthorityKey(patientPublicKeyString: string): string {
    if (!process.env.AUTHORITY_PRIVATE_KEY) {
      throw new Error(
        'AUTHORITY_PRIVATE_KEY is not set. Generate an ECDSA P-256 key pair and add it to your .env file. See .env.example for instructions.'
      );
    }

    const keyData = JSON.parse(process.env.AUTHORITY_PRIVATE_KEY);
      
    try {
      const privateKey = crypto.createPrivateKey({
        key: keyData,
        format: 'jwk',
      });

      const signObj = crypto.createSign('SHA256');
      signObj.update(patientPublicKeyString);
      return signObj.sign(privateKey).toString('base64');
    } catch (e) {
      console.error('Failed to sign with Authority private key:', e);
      return '';
    }
  }

  static simulateAuthoritySignature(patientIdentifier: string): string {
    return this.signWithAuthorityKey(patientIdentifier);
  }
}
