# LifeTag Security Architecture

This document outlines the zero-trust security model, cryptographic protocols, and defensive layers implemented in the LifeTag system.

## 1. Cryptographic Proximity Proofs (NFC)

LifeTag utilizes asymmetric cryptography to prove that an NFC scan actually occurred with a physical, authorized tag, preventing remote spoofing.

### Patient Wallet (IndexedDB)
- **ECDSA P-256 Key Pair**: Generated locally in the browser upon tag creation.
- **Extractable: False**: The private key is stored securely in IndexedDB and cannot be read or extracted by any JavaScript code, preventing XSS exfiltration.
- **Digital Signatures**: The payload (Triage Data) is signed directly by the patient's private key before being written to the NFC tag.

### Authority Trust Anchor
- **Two-Tier Certification**: The backend possesses an Authority Private Key (loaded from the environment). It signs the patient's public key to certify that the tag belongs to a registered patient.
- **Offline Verification**: First Responder devices contain a hardcoded Authority Public Key. When they scan a tag, they first verify the Authority Signature, then use the certified patient public key to verify the payload signature.

## 2. Authentication & Authorization

### JWT Dual-Token Strategy
- **Access Tokens**: Short-lived (15 minutes). Used for all API requests. Reduces the window of vulnerability if a token is intercepted.
- **Refresh Tokens**: Long-lived (7 days), stateful tokens stored in the PostgreSQL database.
- **Revocation**: Logging out deletes the Refresh Token from the database. A revoked Refresh Token can no longer generate Access Tokens.
- **Obfuscation**: On the client side, tokens are obfuscated (Base64 encoded + reversed) in LocalStorage to prevent casual discovery via DevTools inspection.

### Access Control Gates
- **Role-Based Access Control (RBAC)**: Enforced via `requireRole` middleware. Prevents First Responders from accessing Doctor-level data.
- **Medical Consent Gate**: Doctors can only access full medical histories if:
  1. They are listed as the patient's primary physician, OR
  2. They have physically scanned the patient's NFC tag within the last 24 hours.

## 3. Defensive Engineering

- **End-to-End Validation (Zod)**: Every incoming API request (body, params) is validated against strict schemas before hitting controllers.
- **Rate Limiting**: Aggressive rate limiting on authentication routes (10 requests / 15 mins) to prevent brute-force attacks.
- **Environment Hardening**: Destructive operations (like database seeding) and fallback cryptographic keys are explicitly blocked if `NODE_ENV=production`.
- **Error Sanitization**: Production error messages are masked to prevent leaking stack traces or internal database structures.
- **Password Hashing**: `bcrypt` with 12 salt rounds is used uniformly across all password storage.
