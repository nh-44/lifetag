import { NfcTagPayload } from "@/types";

/**
 * LifeTag Zero-Trust Cryptographic & NFC Payload Engine
 * Implements real ECDSA signatures, native Gzip compression, and two-tier Trusted Authority Verification.
 */
export class NfcCryptoService {
  private static KEY_STORAGE_KEY = "lifetag_ecdsa_keypair";

  // Pre-generated static Healthcare Authority P-256 ECDSA public key for verifications (offline trust anchor)
  private static AUTHORITY_PUBLIC_KEY_JWK = {
    kty: "EC",
    crv: "P-256",
    x: "Sy52YAL3SADCzj6OTAiLmHGTiJR3-AjJimHizE3n3Eg",
    y: "KHaR_N-H8tgqAy4zKrzs64HN1PBy-1mEQHDL5SzLXOU",
  };

  private static DB_NAME = "LifeTagCryptoDB";
  private static STORE_NAME = "keys";
  private static KEY_ID = "ecdsa_keypair";

  private static async getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME);
        }
      };
    });
  }

  private static async getStoredKeyPair(): Promise<CryptoKeyPair | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.STORE_NAME, "readonly");
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.get(this.KEY_ID);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  private static async storeKeyPair(keyPair: CryptoKeyPair): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.STORE_NAME, "readwrite");
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.put(keyPair, this.KEY_ID);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Generates a persistent ECDSA P-256 key pair in IndexedDB (representing the patient's local wallet)
   */
  static async getOrCreateKeyPair(): Promise<CryptoKeyPair> {
    try {
      // Migrate from localStorage if it exists (one-time migration)
      const legacyStored = localStorage.getItem(this.KEY_STORAGE_KEY);
      if (legacyStored) {
        try {
          const parsed = JSON.parse(legacyStored);
          const privateKey = await window.crypto.subtle.importKey(
            "jwk",
            parsed.privateKey,
            { name: "ECDSA", namedCurve: "P-256" },
            false, // Make it non-extractable in memory now
            ["sign"]
          );
          const publicKey = await window.crypto.subtle.importKey(
            "jwk",
            parsed.publicKey,
            { name: "ECDSA", namedCurve: "P-256" },
            true, // Public key is always extractable
            ["verify"]
          );
          const legacyKeyPair = { privateKey, publicKey };
          await this.storeKeyPair(legacyKeyPair);
          localStorage.removeItem(this.KEY_STORAGE_KEY);
          return legacyKeyPair;
        } catch (e) {
          console.warn("Legacy key migration failed, starting fresh.");
          localStorage.removeItem(this.KEY_STORAGE_KEY);
        }
      }

      const storedKeyPair = await this.getStoredKeyPair();
      if (storedKeyPair) {
        return storedKeyPair;
      }
    } catch (e) {
      console.warn("Failed to load stored keypair from IndexedDB, generating new one", e);
    }

    const keyPair = await window.crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      false, // extractable: false prevents XSS from stealing the private key
      ["sign", "verify"]
    );

    await this.storeKeyPair(keyPair);

    return keyPair;
  }

  /**
   * Encodes a patient emergency record into an NDEF-compatible signed JSON payload with two-tier signatures
   */
  static async generateTagPayload(patientData: {
    name: string;
    bloodGroup: string;
    allergies: string[];
    emergencyContacts: Array<{ userId: string; name: string }>;
    dnrStatus: boolean;
    fhirPatientId: string;
    authoritySignature?: string;
  }): Promise<NfcTagPayload> {
    const payload: NfcTagPayload = {
      version: '2.0',
      timestamp: new Date().toISOString(),
      fhirPatientId: patientData.fhirPatientId,
      triageData: {
        name: patientData.name,
        bloodGroup: patientData.bloodGroup,
        allergies: patientData.allergies,
        emergencyContacts: patientData.emergencyContacts,
        dnrStatus: patientData.dnrStatus,
      },
    };

    // 1. Retrieve patient's local key pair
    const keyPair = await this.getOrCreateKeyPair();
    const patientPublicKeyJwk = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
    payload.tagId = JSON.stringify(patientPublicKeyJwk);

    // 2. Sign triageData using patient's private key
    const triageDataBytes = new TextEncoder().encode(JSON.stringify(payload.triageData));
    const patientSignatureBuffer = await window.crypto.subtle.sign(
      { name: "ECDSA", hash: { name: "SHA-256" } },
      keyPair.privateKey,
      triageDataBytes
    );
    payload.signature = btoa(String.fromCharCode(...new Uint8Array(patientSignatureBuffer)));

    // 3. Attach Authority certification from backend (if available)
    if (patientData.authoritySignature) {
      payload.authoritySignature = patientData.authoritySignature;
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

    try {
      // Step 1: Import patient public key from tag payload
      const patientPublicKeyJwk = JSON.parse(payload.tagId);
      const patientPublicKey = await window.crypto.subtle.importKey(
        "jwk",
        patientPublicKeyJwk,
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["verify"]
      );

      // Step 2: Verify Patient Signature over Triage Data
      const patientSignatureBytes = new Uint8Array(
        atob(payload.signature).split("").map((c) => c.charCodeAt(0))
      );
      const triageDataBytes = new TextEncoder().encode(JSON.stringify(payload.triageData));

      const isPatientVerified = await window.crypto.subtle.verify(
        { name: "ECDSA", hash: { name: "SHA-256" } },
        patientPublicKey,
        patientSignatureBytes,
        triageDataBytes
      );

      if (!isPatientVerified) {
        return { verified: false, trustedAuthority: false, error: "Patient signature invalid (tampered triage data)" };
      }

      // Step 3: Verify Authority Certificate (if present) to prevent spoofing
      let isAuthorityVerified = false;
      if (payload.authoritySignature) {
        const authorityPublicKey = await window.crypto.subtle.importKey(
          "jwk",
          this.AUTHORITY_PUBLIC_KEY_JWK,
          { name: "ECDSA", namedCurve: "P-256" },
          true,
          ["verify"]
        );
        const authoritySignatureBytes = new Uint8Array(
          atob(payload.authoritySignature).split("").map((c) => c.charCodeAt(0))
        );
        const publicKeyStringBytes = new TextEncoder().encode(payload.tagId);

        isAuthorityVerified = await window.crypto.subtle.verify(
          { name: "ECDSA", hash: { name: "SHA-256" } },
          authorityPublicKey,
          authoritySignatureBytes,
          publicKeyStringBytes
        );
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
    const jsonString = JSON.stringify(payload);
    const stream = new Response(jsonString).body?.pipeThrough(new CompressionStream("gzip"));
    if (!stream) throw new Error("CompressionStream not supported");
    const compressedBuffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(compressedBuffer);
  }

  /**
   * Decompresses Gzip payload back to JSON payload
   */
  static async decompressPayload(compressed: Uint8Array): Promise<NfcTagPayload> {
    const stream = new Response(compressed).body?.pipeThrough(new DecompressionStream("gzip"));
    if (!stream) throw new Error("DecompressionStream not supported");
    const decompressedBuffer = await new Response(stream).arrayBuffer();
    const jsonString = new TextDecoder().decode(decompressedBuffer);
    return JSON.parse(jsonString) as NfcTagPayload;
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
   * Reconstructs standard HL7 FHIR JSON structures from the compressed LifeTag format
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
