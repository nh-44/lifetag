import { userRepository } from '../repositories/userRepository';
import { CryptoUtils } from '../utils/crypto.utils';
import { NfcService, certSigningString } from '../services/nfc.service';
import { CertifyTagRequestBody } from '../types/issuance.types';

// How far the issuing device's clock may drift from the server's. issuedAt is
// signed into the tag, so it is checked here rather than trusted blindly.
const MAX_CLOCK_SKEW_SECONDS = 300;

export const issuanceService = {
  /**
   * Certifies one freshly generated tag key for one patient and one issuance.
   * Recording issuedAt makes this the only current tag: every tag issued
   * earlier for the same patient is superseded (NfcService.classifyFreshness).
   */
  certifyTag: async (issuerUserId: string, body: CertifyTagRequestBody) => {
    const { accountId, publicKey, issuedAt } = body;

    const patient = await userRepository.findByAccountId(accountId);
    if (!patient) throw { statusCode: 404, message: 'Patient not found' };
    if (!patient.triageProfile) {
      throw { statusCode: 409, message: 'Patient has no triage profile to issue a tag for' };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - issuedAt) > MAX_CLOCK_SKEW_SECONDS) {
      throw { statusCode: 400, message: 'issuedAt is too far from server time; check the issuing device clock' };
    }

    try {
      NfcService.assertValidP256Point(publicKey.x, publicKey.y);
    } catch {
      throw { statusCode: 400, message: 'publicKey is not a valid P-256 point' };
    }

    const authoritySignature = CryptoUtils.signWithAuthorityKey(
      certSigningString(accountId, issuedAt, publicKey.x, publicKey.y)
    );

    await userRepository.recordTagIssuance(patient.userId, {
      authoritySignature,
      tagIssuedAt: new Date(issuedAt * 1000),
      tagIssuedBy: issuerUserId,
    });

    return { authoritySignature, issuedAt };
  },

  /** Patient-initiated revocation of a lost or stolen tag. Takes effect for every tag issued so far. */
  revokeOwnTag: async (patientUserId: string) => {
    const patient = await userRepository.findByUserId(patientUserId);
    if (!patient?.triageProfile) throw { statusCode: 404, message: 'No triage profile found' };
    const revokedAt = new Date();
    await userRepository.revokeTag(patientUserId, revokedAt);
    return { revokedAt: revokedAt.toISOString() };
  },
};
