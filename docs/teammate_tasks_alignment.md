# Teammate Alignment Guide: Two-Tier Certificate Verification Integration

**Author:** Naveen (Cryptography & NFC Core Lead)  
**Target Audience:** Preksha (Backend), Nandita (Frontend), Navyashree (Hardware & QA)

We have upgraded the core cryptographic engine to resolve the self-referential trust anchor problem identified by reviewers. Instead of verifying a tag using only its own public key, we now enforce a **Two-Tier Certificate Authority Model**:
1. **Patient Signature**: Verifies that the triage data was written by the patient.
2. **Authority Signature (Certificate)**: Verifies that the patient's public key has been certified by a trusted Healthcare Authority.

Here are the specific action items required by each teammate to align the UI, database, and hardware components.

---

## 🖥️ Preksha — Backend Lead (API, Auth & DB Data Layer)

To support the authority-signed keys, the server needs to store the authority signatures.

### Required Actions:
1. **Prisma Schema Update**:
   - Update `schema.prisma` to add an optional `authoritySignature` field to the `TriageProfile` model:
     ```prisma
     model TriageProfile {
       ...
       authoritySignature String?
     }
     ```
2. **Profile Generation & DTO Updates**:
   - Update `server/src/types/patient.types.ts` to include `authoritySignature?: string` in DTO structures.
   - During patient profile creation or update, call the `CryptoUtils` to generate/simulate the authority signature of the patient's public key, and store it in the database.
3. **Scan Audit Logger**:
   - In `/api/v1/scans`, parse the tag payload and verify its authority status before completing the audit entry. Record whether the tag was `Authority-Certified` or `Self-Signed`.

---

## 🎨 Nandita — Frontend UI Lead (Patient & Responder Experience)

The UI must reflect the new trust hierarchy so responders can differentiate between official medical tags and unverified self-signed tags.

### Required Actions:
1. **Trust Indicators (Emergency Info View)**:
   - On [EmergencyInfo.tsx](../client/src/pages/EmergencyInfo.tsx), call `NfcCryptoService.verifyTagIntegrity(payload)` on the scanned tag payload.
   - Display a verified trust badge based on the result:
     - **Green Badge ("Authority Certified")**: Patient signature and authority signature are both verified.
     - **Yellow Badge ("Self-Signed/Unverified Key")**: Patient signature is verified but the authority certificate is missing or invalid.
     - **Red Banner ("Verification Failed")**: Patient signature fails (data has been tampered with).
2. **Registry Status Display**:
   - In the patient profile view, display the registration status of the patient's local key.

---

## 📡 Navyashree — NFC Hardware API & QA Lead

The Web NFC scanner and writer must write the new payload keys.

### Required Actions:
1. **NFC Tag Writer Payload Updates**:
   - In [NfcWriter.tsx](../client/src/components/nfc/NfcWriter.tsx), ensure that when generating the tag data block, the payload includes the `authoritySignature` returned from the patient's profile API.
2. **Offline Mode Verification**:
   - Test scanning tags in offline conditions. Verify that the client is able to successfully execute `verifyTagIntegrity` completely offline using the pre-loaded root authority public key.
3. **Integration Test Suite**:
   - Add two unit tests:
     - Verify tag scans with valid certificates return `trustedAuthority: true`.
     - Verify tag scans with modified payloads fail validation entirely.
