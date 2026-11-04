import { describe, it, expect } from 'vitest';
import { decideScanOutcome } from '../../controllers/scan.controller';
import { TagFreshness } from '../../services/nfc.service';

const FRESHNESS: TagFreshness[] = ['current', 'superseded', 'revoked', 'unregistered'];

describe('decideScanOutcome (scan policy)', () => {
  it('certifies exactly one combination: authority-certified AND current', () => {
    for (const trusted of [true, false]) {
      for (const f of FRESHNESS) {
        expect(decideScanOutcome(trusted, f).certified).toBe(trusted && f === 'current');
      }
    }
  });

  it('alerts the clinician on a revoked tag whether or not it is certified', () => {
    expect(decideScanOutcome(true, 'revoked').alert).toMatch(/revoked/);
    expect(decideScanOutcome(false, 'revoked').alert).toMatch(/revoked/);
  });

  it('flags a valid certificate with no recorded issuance as possible authority-key compromise', () => {
    expect(decideScanOutcome(true, 'unregistered').alert).toMatch(/does not match any recorded issuance/);
  });

  it('a self-signed, never-registered tag is logged quietly (good-faith scan of an uncertified tag)', () => {
    expect(decideScanOutcome(false, 'unregistered')).toEqual({ certified: false });
  });

  it('warns that a superseded tag may hold outdated data', () => {
    expect(decideScanOutcome(true, 'superseded').alert).toMatch(/newer tag/);
  });

  it('a current certified tag raises no alert', () => {
    expect(decideScanOutcome(true, 'current')).toEqual({ certified: true });
  });
});
