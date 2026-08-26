# LifeTag — Team Work Division & Build Guide

**Team:** Naveen, Nandita, Preksha, Navyashree  
**Timeline:** Week 1 (Working v1) → Week 2 (Hardening + Paper Draft)

---

## 📁 Monorepo Layout (Restructured)
All paths in this guide refer to the reorganized project layout:
```
lifetag/
├── client/          # React + Vite frontend (Vite port 8080)
├── server/          # Express + Prisma + PostgreSQL backend (API port 9000)
└── docs/            # Project architecture & documentation guides
```

---

## 1. Role Assignment

### 🔑 Naveen — Cryptography, NFC Core & Academic Narrative Owner
Owns cryptographic implementation and the Web NFC payload compression engine to ensure alignment with the conference paper's primary contributions.

**File Ownership:**
- `client/src/services/nfcCryptoService.ts` — Implements ECDSA P-256 signatures, CBOR serialization, and byte-budget validation.
- `server/src/utils/crypto.utils.ts` [NEW] — Backend ECDSA signature validation and hybrid post-quantum (Kyber-768) KEM helper.
- `server/src/services/nfc.service.ts` [NEW] — CBOR data packing and Brotli compression routines.
- `server/scripts/benchmark/` [NEW] — Automated script to measure payload latency and compression ratios.
- `docs/` — Architecture specifications, threat model writeup, and LaTeX paper draft.

---

### 🖥️ Preksha — Backend Lead (API, Auth & DB Data Layer)
Owns REST endpoints, relational modeling, authorization flow, and database integrity.

**File Ownership:**
- `server/prisma/schema.prisma` — Defines `User`, `TriageProfile`, `MedicalHistory`, and `ScanAuditLog` models.
- `server/src/middlewares/` — `auth.middleware.ts`, `rbac.middleware.ts`, `validate.middleware.ts`, and `error.middleware.ts`.
- `server/src/repositories/` — High-efficiency Prisma queries mapping data projections (redacting sensitive history for EMTs).
- `server/src/services/` — `auth.service.ts`, `patient.service.ts`, `doctor.service.ts`, and `firstResponder.service.ts`.
- `server/src/routes/v1/` — Route maps including `/auth`, `/patients`, `/doctors`, `/first-responders`, and `/scans`.

---

### 🎨 Nandita — Frontend UI Lead (Patient & First-Responder UX)
Owns the core patient profile dashboard, emergency triage views, and responsive design systems.

**File Ownership:**
- `client/src/pages/` — `EmergencyInfo.tsx` (EMT triage view), `EditProfile.tsx` (patient management), `MyContacts.tsx`, and `MyDoctor.tsx`.
- `client/src/components/layout/` — `Header.tsx` (global navigation and role indicator) and `Footer.tsx`.
- `client/src/contexts/AuthContext.tsx` — Global auth session and token storage logic.
- `client/src/components/ui/` — Shadcn / Radix wrapper elements.

---

### 📡 Navyashree — NFC Hardware API, Doctor Portal & QA Lead
Owns native browser Web NFC reader/writer modules, Doctor-only medical portal pages, and the verification test suite.

**File Ownership:**
- `client/src/components/nfc/` — `NfcScanner.tsx` (NDEF reader), `NfcWriter.tsx` (NDEF programmer), `ScanHistory.tsx`, and `AdminPanel.tsx`.
- `client/src/pages/` — `TagTracer.tsx` (hardware control page) and `MedicalInfo.tsx` (Doctor patient history portal).
- Client & Server testing suites using Vitest and Jest.
- Performance profiling runs across varying mobile platforms.

---

## 📅 Two-Week Roadmap

### Week 1 — Core Working Prototype (v1)

| Day | Naveen (Crypto) | Preksha (Backend) | Nandita (UI) | Navyashree (Hardware/QA) |
|---|---|---|---|---|
| **1** | ECDSA setup & WebCrypto | Schema definitions & DTOs | AuthContext setup | Web NFC NDEF Read/Write PoC |
| **2** | CBOR payload compression | JWT & RBAC Middlewares | EmergencyInfo static layout | `NfcScanner` & `NfcWriter` |
| **3** | NTAG215 byte budget tool | Triage & Medical APIs | EditProfile form components | `TagTracer` admin controls |
| **4** | Benchmark harness structure | `ScanAuditLog` repository | Verified/Unverified badge states | `ScanHistory` local logs |
| **5** | E2E Cryptographic validation | End-to-end integration testing | UI connection to REST API | E2E Tag Scan → View Triage |
| **6–7** | **E2E Integration bash: write signed tag ➔ scan tag ➔ show verified triage ➔ record log** | | | |

* **Week 1 Exit Criteria**: Offline signed tag payload can be written, scanned, verified client-side, and results written to the PostgreSQL database with a verified status badge.

### Week 2 — Hardening, Optimization & Academic Writing

| Day | Naveen (Crypto) | Preksha (Backend) | Nandita (UI) | Navyashree (Hardware/QA) |
|---|---|---|---|---|
| **1–2** | Kyber-768 KEM integration | Consent check API logic | Consent popups & triggers | Run multi-device benchmarks |
| **3** | Key Revocation logic | Audit log exporter endpoint | Offline status flags | Plot latency graphs (Vitest) |
| **4** | Threat model definition | CORS & Rate limiting | Accessibility validation | Unit tests code coverage check |
| **5** | **Drafting: Methodology/Design** | Drafting: Systems Architecture | Drafting: Interface layout charts | Drafting: Results tables |
| **6–7** | **Final paper compilation & submission review** | | | |

* **Week 2 Exit Criteria**: Hybrid Kyber-768 KEM complete, multi-device latency graphs populated, code coverage > 85%, and final LaTeX paper manuscript ready.

---

## 🛠️ Unified Tooling Matrix

| Layer | Tool | Rationale |
|---|---|---|
| **API Testing** | Postman / Thunder Client | Standardized request collection sharing. |
| **Database** | Prisma Studio | Instant visual data exploration. |
| **Containerization** | Docker Compose | Run localized PostgreSQL instances without dependency conflicts. |
| **Crypto APIs** | Web Crypto API / Noble Crypto | Web-native ECDSA signatures and high-performance JS implementations. |
| **Compression** | `cbor-x` & `zlib` (Brotli) | Maximize NDEF data packing density (< 504 bytes limit). |
| **Load Testing** | Autocannon / k6 | Gather benchmark latency figures (p95/p99) for the systems paper. |
