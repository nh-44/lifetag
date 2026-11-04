import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

vi.mock('../../repositories/userRepository', () => ({
  userRepository: {
    findByAccountId: vi.fn(),
    findByUserId: vi.fn(),
    recordTagIssuance: vi.fn(),
    revokeTag: vi.fn(),
  },
}));

import { userRepository } from '../../repositories/userRepository';
import { issuanceService } from '../../services/issuance.service';
import { NfcService, TAG_FORMAT_VERSION, contentSigningString } from '../../services/nfc.service';
import { installTestAuthority, AuthorityFixture } from '../helpers/tagFactory';

const repo = userRepository as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe('issuanceService.certifyTag', () => {
  let authority: AuthorityFixture;
  const patientKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const { x, y } = patientKeys.publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const now = () => Math.floor(Date.now() / 1000);

  beforeEach(() => {
    authority = installTestAuthority();
    vi.clearAllMocks();
    repo.findByAccountId.mockResolvedValue({ userId: 'US12345', accountId: '12345', triageProfile: { id: 't1' } });
  });

  afterEach(() => authority.restore());

  it('returns a certificate that makes the issued tag authority-trusted, and records the issuer', async () => {
    const issuedAt = now();
    const { authoritySignature } = await issuanceService.certifyTag('DR11111', {
      accountId: '12345', publicKey: { x, y }, issuedAt,
    });

    const tag = {
      version: TAG_FORMAT_VERSION,
      timestamp: new Date(issuedAt * 1000).toISOString(),
      fhirPatientId: '12345',
      tagId: JSON.stringify({ kty: 'EC', crv: 'P-256', x, y }),
      triageData: { name: 'P', bloodGroup: 'O-Negative', allergies: [], emergencyContacts: [], dnrStatus: false },
      signature: '',
      authoritySignature,
    };
    tag.signature = crypto
      .sign('sha256', Buffer.from(contentSigningString(tag)), { key: patientKeys.privateKey, dsaEncoding: 'ieee-p1363' })
      .toString('base64');

    expect(NfcService.verifyTagIntegrity(tag)).toEqual({ verified: true, trustedAuthority: true });
    expect(repo.recordTagIssuance).toHaveBeenCalledWith('US12345', {
      authoritySignature,
      tagIssuedAt: new Date(issuedAt * 1000),
      tagIssuedBy: 'DR11111',
    });
  });

  it('rejects an issuedAt outside the allowed clock skew', async () => {
    await expect(
      issuanceService.certifyTag('DR11111', { accountId: '12345', publicKey: { x, y }, issuedAt: now() - 3600 })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repo.recordTagIssuance).not.toHaveBeenCalled();
  });

  it('rejects coordinates that are not a point on P-256', async () => {
    const bogus = Buffer.alloc(32, 7).toString('base64url');
    await expect(
      issuanceService.certifyTag('DR11111', { accountId: '12345', publicKey: { x: bogus, y: bogus }, issuedAt: now() })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('returns 404 for an unknown patient', async () => {
    repo.findByAccountId.mockResolvedValue(null);
    await expect(
      issuanceService.certifyTag('DR11111', { accountId: '99999', publicKey: { x, y }, issuedAt: now() })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws instead of returning an empty certificate when the authority key is missing', async () => {
    delete process.env.AUTHORITY_PRIVATE_KEY;
    await expect(
      issuanceService.certifyTag('DR11111', { accountId: '12345', publicKey: { x, y }, issuedAt: now() })
    ).rejects.toThrow(/AUTHORITY_PRIVATE_KEY/);
    expect(repo.recordTagIssuance).not.toHaveBeenCalled();
  });
});

describe('issuanceService.revokeOwnTag', () => {
  it('stamps tagRevokedAt for the calling patient', async () => {
    repo.findByUserId.mockResolvedValue({ userId: 'US12345', triageProfile: { id: 't1' } });
    const { revokedAt } = await issuanceService.revokeOwnTag('US12345');
    expect(repo.revokeTag).toHaveBeenCalledWith('US12345', new Date(revokedAt));
  });
});
