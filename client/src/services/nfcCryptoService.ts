import { NfcTagPayload } from "@/types";

/** Tag format v3: the patient ID and issuedAt are signed together with the triage data. Must match server/src/services/nfc.service.ts. */
export const TAG_FORMAT_VERSION = "3.0";

type TriageData = NfcTagPayload["triageData"];
type PublicPoint = { x: string; y: string };

/**
 * Called during issuance with the freshly generated public key and the tag's
 * issuedAt (unix seconds); resolves to the Healthcare Authority certificate.
 * In the app this is userService.certifyTagKey, which only a DOCTOR may call.
 */
export type CertifyFn = (publicKey: PublicPoint, issuedAt: number) => Promise<string>;

// Offline trust anchors. Must be the public half of the server's AUTHORITY_PRIVATE_KEY:
// run `npx ts-node scripts/print-authority-public-key.ts` in server/ and set
// VITE_AUTHORITY_PUBLIC_KEYS in client/.env. Several keys may be listed during rotation.
const DEFAULT_AUTHORITY_PUBLIC_KEYS: PublicPoint[] = [
  { x: "Uc4y1v9im9DwBm1ZBB2sRvV16C1ydaMibBkUJpV0Bnk", y: "TqNtq2pxdFWi_5U1sWLcanbR_1zkM3sFojb0_UYn4Us" },
];

const BLOOD_GROUP_LONG: Record<string, string> = {
  "O-": "O-Negative", "O+": "O-Positive",
  "A-": "A-Negative", "A+": "A-Positive",
  "B-": "B-Negative", "B+": "B-Positive",
  "AB-": "AB-Negative", "AB+": "AB-Positive",
};

const ECDSA_SIGN = { name: "ECDSA", hash: { name: "SHA-256" } } as const;
const P256 = { name: "ECDSA", namedCurve: "P-256" } as const;

const toBase64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/**
 * AegisTag Zero-Trust Cryptographic & NFC Payload Engine
 * Implements real ECDSA signatures, native Gzip compression, and two-tier Trusted Authority Verification.
 */
export class NfcCryptoService {
  static getAuthorityPublicKeys(): PublicPoint[] {
    const configured = import.meta.env.VITE_AUTHORITY_PUBLIC_KEYS;
    if (configured) {
      try {
        const keys = JSON.parse(configured);
        if (Array.isArray(keys) && keys.length > 0) return keys;
      } catch {
        console.error("VITE_AUTHORITY_PUBLIC_KEYS is not a JSON array of {x, y}; using the built-in key");
      }
    }
    return DEFAULT_AUTHORITY_PUBLIC_KEYS;
  }

  /** The exact triage object that is signed; see canonicalTriage in the server's nfc.service.ts. */
  static canonicalTriage(t: TriageData): TriageData {
    return {
      name: t.name,
      bloodGroup: BLOOD_GROUP_LONG[t.bloodGroup] || t.bloodGroup,
      allergies: (t.allergies || []).filter(
        (a) => a.toLowerCase() !== "none" && a.toLowerCase() !== "no allergies"
      ),
      emergencyContacts: (t.emergencyContacts || []).map((c) => ({ userId: c.userId, name: c.name })),
      dnrStatus: !!t.dnrStatus,
    };
  }

  static issuedAtSeconds(isoTimestamp: string): number {
    return Math.floor(new Date(isoTimestamp).getTime() / 1000);
  }

  static contentSigningString(p: Pick<NfcTagPayload, "version" | "fhirPatientId" | "timestamp" | "triageData">): string {
    return JSON.stringify([
      "aegistag-content-v3",
      p.version,
      p.fhirPatientId,
      this.issuedAtSeconds(p.timestamp),
      this.canonicalTriage(p.triageData),
    ]);
  }

  static certSigningString(fhirPatientId: string, issuedAt: number, x: string, y: string): string {
    return JSON.stringify(["aegistag-cert-v3", fhirPatientId, issuedAt, x, y]);
  }

  /**
   * Builds a signed v3 tag payload. Every issuance uses a fresh, non-extractable
   * key pair that exists only for the duration of this call: nothing is stored on
   * the issuing (staff) device, so there is no long-lived private key to steal.
   * Re-writing a patient's tag means a new key, a new certificate and a new
   * issuedAt, which supersedes every earlier tag server-side.
   */
  static async generateTagPayload(
    patientData: {
      name: string;
      bloodGroup: string;
      allergies: string[];
      emergencyContacts: Array<{ userId: string; name: string }>;
      dnrStatus: boolean;
      fhirPatientId: string;
    },
    certify?: CertifyFn
  ): Promise<NfcTagPayload> {
    const issuedAt = Math.floor(Date.now() / 1000);
    const keyPair = await window.crypto.subtle.generateKey(P256, false, ["sign", "verify"]);
    const { x, y } = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
    if (!x || !y) throw new Error("Failed to export the tag public key");

    const payload: NfcTagPayload = {
      version: TAG_FORMAT_VERSION,
      timestamp: new Date(issuedAt * 1000).toISOString(),
      fhirPatientId: patientData.fhirPatientId,
      triageData: this.canonicalTriage(patientData),
      tagId: JSON.stringify({ kty: "EC", crv: "P-256", x, y }),
    };

    const signature = await window.crypto.subtle.sign(
      ECDSA_SIGN,
      keyPair.privateKey,
      new TextEncoder().encode(this.contentSigningString(payload))
    );
    payload.signature = toBase64(signature);

    if (certify) {
      payload.authoritySignature = await certify({ x, y }, issuedAt);
    }

    return payload;
  }

  /**
   * Verifies an NFC tag payload using two-tier verification: Authority Certification + Patient Signature
   */
  static async verifyTagIntegrity(payload: NfcTagPayload): Promise<{
    verified: boolean;
    trustedAuthority: boolean;
    error?: string;
  }> {
    if (!payload.signature || !payload.tagId) {
      return { verified: false, trustedAuthority: false, error: "Missing signature components" };
    }
    if (payload.version !== TAG_FORMAT_VERSION) {
      return {
        verified: false,
        trustedAuthority: false,
        error: `Unsupported tag format ${payload.version}; this tag must be re-issued`,
      };
    }

    try {
      // Step 1: Verify the patient-key signature over patient ID + issuedAt + triage data
      const { x, y } = JSON.parse(payload.tagId);
      const tagKey = await window.crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x, y }, P256, false, ["verify"]);
      const isPatientVerified = await window.crypto.subtle.verify(
        ECDSA_SIGN,
        tagKey,
        fromBase64(payload.signature),
        new TextEncoder().encode(this.contentSigningString(payload))
      );

      if (!isPatientVerified) {
        return { verified: false, trustedAuthority: false, error: "Patient signature invalid (tampered triage data)" };
      }

      // Step 2: Verify the Authority certificate binding this key to this patient and issuance
      let isAuthorityVerified = false;
      if (payload.authoritySignature) {
        const certBytes = new TextEncoder().encode(
          this.certSigningString(payload.fhirPatientId, this.issuedAtSeconds(payload.timestamp), x, y)
        );
        const certSignature = fromBase64(payload.authoritySignature);
        for (const anchor of this.getAuthorityPublicKeys()) {
          const authorityKey = await window.crypto.subtle.importKey(
            "jwk", { kty: "EC", crv: "P-256", x: anchor.x, y: anchor.y }, P256, false, ["verify"]
          );
          if (await window.crypto.subtle.verify(ECDSA_SIGN, authorityKey, certSignature, certBytes)) {
            isAuthorityVerified = true;
            break;
          }
        }
      }

      return {
        verified: true,
        trustedAuthority: isAuthorityVerified,
      };
    } catch (e) {
      return { verified: false, trustedAuthority: false, error: "Cryptographic exception during verification" };
    }
  }

  /**
   * Compresses payload to Gzip binary layout using browser native CompressionStream
   */
  static async compressPayload(payload: NfcTagPayload): Promise<Uint8Array> {
    const shortPayload = this.toShortFormat(payload);
    const jsonString = JSON.stringify(shortPayload);
    const stream = new Response(jsonString).body?.pipeThrough(new CompressionStream("gzip"));
    if (!stream) throw new Error("CompressionStream not supported");
    const compressedBuffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(compressedBuffer);
  }

  /**
   * Decompresses Gzip payload back to JSON payload
   */
  static async decompressPayload(compressed: Uint8Array): Promise<NfcTagPayload> {
    const stream = new Response(compressed as any).body?.pipeThrough(new DecompressionStream("gzip"));
    if (!stream) throw new Error("DecompressionStream not supported");
    const decompressedBuffer = await new Response(stream).arrayBuffer();
    const jsonString = new TextDecoder().decode(decompressedBuffer);
    const shortPayload = JSON.parse(jsonString);
    return this.fromShortFormat(shortPayload);
  }

  /**
   * Converts full NfcTagPayload to ultra-compact shortened key JSON format
   */
  static toShortFormat(payload: NfcTagPayload): any {
    let kStr = payload.tagId;
    try {
      const jwk = JSON.parse(payload.tagId || "");
      if (jwk.x && jwk.y) {
        kStr = `${jwk.x}.${jwk.y}`;
      }
    } catch (e) {
      // Not a valid JSON JWK, keep string key as-is
    }

    const tNum = Math.floor(new Date(payload.timestamp).getTime() / 1000);

    const bgMap: Record<string, string> = {
      "O-Negative": "O-", "O-Positive": "O+",
      "A-Negative": "A-", "A-Positive": "A+",
      "B-Negative": "B-", "B-Positive": "B+",
      "AB-Negative": "AB-", "AB-Positive": "AB+"
    };
    const shortBg = bgMap[payload.triageData.bloodGroup] || payload.triageData.bloodGroup;

    const cleanAllergies = payload.triageData.allergies.filter(
      a => a.toLowerCase() !== "none" && a.toLowerCase() !== "no allergies"
    );

    return {
      v: payload.version,
      t: tNum,
      id: payload.fhirPatientId,
      iu: payload.isUnsigned || undefined,
      d: {
        n: payload.triageData.name,
        b: shortBg,
        a: cleanAllergies,
        c: payload.triageData.emergencyContacts.map(c => ({
          u: c.userId,
          n: c.name
        })),
        dnr: payload.triageData.dnrStatus
      },
      k: kStr,
      s: payload.signature,
      as: payload.authoritySignature
    };
  }

  /**
   * Restores shortened key JSON format back to full NfcTagPayload
   */
  static fromShortFormat(short: any): NfcTagPayload {
    let tagId = short.k;
    if (short.k && short.k.includes('.')) {
      const [x, y] = short.k.split('.');
      tagId = JSON.stringify({
        kty: "EC",
        crv: "P-256",
        x,
        y
      });
    }

    // A missing timestamp stays invalid rather than defaulting to "now": issuedAt
    // is signed, and silently substituting the current time would make a stale
    // or truncated tag look freshly issued.
    const timestamp = short.t ? new Date(short.t * 1000).toISOString() : "";

    const bgMapInv: Record<string, string> = {
      "O-": "O-Negative", "O+": "O-Positive",
      "A-": "A-Negative", "A+": "A-Positive",
      "B-": "B-Negative", "B+": "B-Positive",
      "AB-": "AB-Negative", "AB+": "AB-Positive"
    };
    const fullBg = bgMapInv[short.d.b] || short.d.b;

    // Must stay [] (not a placeholder like "None") for an empty list; a "None"
    // placeholder belongs in display logic, not in data that is signed.
    const allergies = short.d.a;

    return {
      version: short.v,
      timestamp,
      fhirPatientId: short.id,
      isUnsigned: short.iu || false,
      triageData: {
        name: short.d.n,
        bloodGroup: fullBg,
        allergies,
        emergencyContacts: (short.d.c || []).map((c: any) => ({
          userId: c.u,
          name: c.n
        })),
        dnrStatus: short.d.dnr
      },
      tagId,
      signature: short.s,
      authoritySignature: short.as
    };
  }

  /**
   * Calculates size of the payload (normal JSON string vs. Gzip compressed bytes)
   */
  static async calculateByteSize(payload: NfcTagPayload): Promise<{
    rawBytes: number;
    compressedBytes: number;
    fitsNtag215: boolean;
  }> {
    const rawString = JSON.stringify(payload);
    const rawBytes = new TextEncoder().encode(rawString).length;

    try {
      const compressed = await this.compressPayload(payload);
      return {
        rawBytes,
        compressedBytes: compressed.length,
        fitsNtag215: compressed.length <= 504,
      };
    } catch (e) {
      return {
        rawBytes,
        compressedBytes: rawBytes,
        fitsNtag215: rawBytes <= 504,
      };
    }
  }

  /**
   * Reconstructs standard HL7 FHIR JSON structures from the compressed AegisTag format
   */
  static convertToFhir(triageData: NfcTagPayload["triageData"], patientId: string): {
    fhirPatient: any;
    fhirAllergies: any[];
  } {
    const fhirPatient = {
      resourceType: "Patient",
      id: patientId,
      name: [
        {
          use: "official",
          text: triageData.name,
        }
      ],
      contact: triageData.emergencyContacts.map((contact) => ({
        relationship: [
          {
            coding: [
              {
                system: "http://terminology.hl7.org/CodeSystem/v2-0131",
                code: "C",
                display: "Emergency Contact"
              }
            ]
          }
        ],
        name: {
          text: contact.name
        },
        telecom: [
          {
            system: "phone",
            value: contact.userId // References registered userId
          }
        ]
      }))
    };

    const fhirAllergies = triageData.allergies.map((allergy, index) => ({
      resourceType: "AllergyIntolerance",
      id: `allergy-${index}`,
      patient: {
        reference: `Patient/${patientId}`
      },
      code: {
        text: allergy
      },
      criticality: "high",
      verificationStatus: {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification",
            code: "confirmed"
          }
        ]
      }
    }));

    return { fhirPatient, fhirAllergies };
  }
}
