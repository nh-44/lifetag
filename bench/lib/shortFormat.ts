/**
 * Mirrors the production short-key JSON transform used by the real client
 * (client/src/services/nfcCryptoService.ts `toShortFormat`/`fromShortFormat`,
 * also duplicated in server/src/utils/benchmark.ts). Kept as an independent
 * copy here — same convention the codebase already uses — so this benchmark
 * suite has no build-time dependency on the client's Vite path aliases.
 */

export interface TriageData {
  name: string;
  bloodGroup: string;
  allergies: string[];
  emergencyContacts: Array<{ userId: string; name: string }>;
  dnrStatus: boolean;
}

export interface FullPayload {
  version: string;
  timestamp: string; // ISO
  fhirPatientId: string;
  triageData: TriageData;
  tagId: string; // stringified JWK public key
  signature: string; // base64
  authoritySignature?: string; // base64
}

const BLOOD_GROUP_SHORT: Record<string, string> = {
  'O-Negative': 'O-', 'O-Positive': 'O+',
  'A-Negative': 'A-', 'A-Positive': 'A+',
  'B-Negative': 'B-', 'B-Positive': 'B+',
  'AB-Negative': 'AB-', 'AB-Positive': 'AB+',
};
const BLOOD_GROUP_LONG: Record<string, string> = Object.fromEntries(
  Object.entries(BLOOD_GROUP_SHORT).map(([long, short]) => [short, long])
);

export function toShortFormat(payload: FullPayload): any {
  let kStr = payload.tagId;
  try {
    const jwk = JSON.parse(payload.tagId);
    if (jwk.x && jwk.y) kStr = `${jwk.x}.${jwk.y}`;
  } catch {
    // not JSON JWK, keep as-is
  }

  const tNum = Math.floor(new Date(payload.timestamp).getTime() / 1000);
  const shortBg = BLOOD_GROUP_SHORT[payload.triageData.bloodGroup] || payload.triageData.bloodGroup;
  const cleanAllergies = payload.triageData.allergies.filter(
    (a) => a.toLowerCase() !== 'none' && a.toLowerCase() !== 'no allergies'
  );

  return {
    v: payload.version,
    t: tNum,
    id: payload.fhirPatientId,
    d: {
      n: payload.triageData.name,
      b: shortBg,
      a: cleanAllergies,
      c: payload.triageData.emergencyContacts.map((c) => ({ u: c.userId, n: c.name })),
      dnr: payload.triageData.dnrStatus,
    },
    k: kStr,
    s: payload.signature,
    as: payload.authoritySignature,
  };
}

export function fromShortFormat(short: any): FullPayload {
  let tagId = short.k;
  if (short.k && short.k.includes('.')) {
    const [x, y] = short.k.split('.');
    tagId = JSON.stringify({ kty: 'EC', crv: 'P-256', x, y });
  }

  const timestamp = short.t ? new Date(short.t * 1000).toISOString() : new Date().toISOString();
  const fullBg = BLOOD_GROUP_LONG[short.d.b] || short.d.b;
  // Must stay [] for an empty list — see the matching fix + comment in the
  // production client/src/services/nfcCryptoService.ts fromShortFormat().
  const allergies = short.d.a;

  return {
    version: short.v,
    timestamp,
    fhirPatientId: short.id,
    triageData: {
      name: short.d.n,
      bloodGroup: fullBg,
      allergies,
      emergencyContacts: (short.d.c || []).map((c: any) => ({ userId: c.u, name: c.n })),
      dnrStatus: short.d.dnr,
    },
    tagId,
    signature: short.s,
    authoritySignature: short.as,
  };
}
