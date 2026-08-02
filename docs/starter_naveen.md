# Starter Guide — Naveen (Cryptography, NFC Core & Academic Narrative Owner)

Welcome to your LifeTag workload starter page. This document outlines your exact development tasks, coding guidelines, and integration interfaces.

---

## 🛠️ Workload & Goals
1. **ECDSA P-256 Signatures**: Implement browser-native and Node-native asymmetric signing and verification routines.
2. **CBOR Serialization & Brotli Compression**: Encode the emergency patient profile payload into a highly compressed format to comfortably fit under the 504-byte limit of standard NTAG215 hardware.
3. **Latency Benchmarking**: Develop scripts to measure reading/writing overhead and cryptographic verification time (in milliseconds).
4. **Academic Paper Draft**: Compile the Systems Design, Cryptography, and Results sections for the LaTeX paper draft.

---

## 📋 Naming Schemes & Coding Guidelines
- **Helper Utilities**: Locate in `client/src/services/nfcCryptoService.ts` and `server/src/utils/crypto.utils.ts`.
- **Functions**: Use descriptive `camelCase` (e.g., `verifyPayloadSignature`, `compressTriagePayload`).
- **Data Shapes**: Use type schemas defined in `client/src/types/index.ts` and ensure binary formats map exactly.

---

## 🔑 Common Information
- **Client Dev URL**: `http://localhost:8080` (configured in `client/vite.config.ts`)
- **Backend API URL**: `http://localhost:9000/api/v1` (configured in `server/src/server.ts`)
- **Database Engine**: Prisma Client with PostgreSQL

---

## 🏁 Immediate Starter Steps
1. Review the existing `client/src/services/nfcCryptoService.ts` file.
2. Replace the mock signature generator (`LT-SIG-XXXX`) with a real ECDSA signature verification routine using the browser's `SubtleCrypto` API.
3. Write a test case in `client/src/services/nfcCryptoService.test.ts` verifying that tampered payloads are rejected correctly.
