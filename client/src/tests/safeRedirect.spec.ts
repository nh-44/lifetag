import { describe, it, expect } from 'vitest';
import { safeInternalPath, passwordProblem } from '@/lib/safeRedirect';

describe('safeInternalPath', () => {
  it.each(['/medical-info/12345', '/edit-profile', '/emergency-info/1?x=y'])('keeps internal path %s', (p) => {
    expect(safeInternalPath(p)).toBe(p);
  });

  it.each(['https://evil.example', '//evil.example', String.raw`/\evil.example`, 'javascript:alert(1)', 'medical-info', '', null, '/a\nb'])(
    'rejects %j',
    (p) => {
      expect(safeInternalPath(p as any)).toBe('/');
    }
  );
});

describe('passwordProblem (mirrors server rule)', () => {
  it.each([['short1', /8 characters/], ['allletters', /number/], ['12345678', /letter/]])('%s -> %s', (pw, msg) => {
    expect(passwordProblem(pw)).toMatch(msg);
  });
  it('accepts a compliant password', () => expect(passwordProblem('correct1horse')).toBeNull());
});
