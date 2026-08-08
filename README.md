# LifeTag: Decentralized Emergency Medical Profile & NFC Health System

[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?style=flat&logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?style=flat&logo=react&logoColor=black)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Web NFC](https://img.shields.io/badge/Web_NFC-NDEF-008080?style=flat&logo=nfc&logoColor=white)](https://w3c.github.io/web-nfc/)

LifeTag is a consolidated emergency medical profile application and Web NFC hardware toolkit. It provides instant, offline-resilient access to critical triage medical data (blood group, severe allergies, emergency contacts, DNR status) for first responders while maintaining role-based authentication and secure data views for doctors and patients.

---

## 🚀 Features

- 🏥 **Emergency Triage Profiles**: Rapid single-tap or quick-scan access to life-saving medical metrics.
- 📡 **Web NFC Hardware Utilities (Tag Tracer)**: Built-in NDEF scanner, NDEF payload writer, and administrative hardware panel for writing emergency IDs to passive NTAG215/NTAG216 tags.
- 🔐 **Role-Based Views & Security**:
  - **Public / First Responder**: Instant view of emergency contacts, blood type, allergies, and organ donor status.
  - **Verified Doctor Portal**: Deep medical access including medical history, surgical records, and vitals checkups.
- 🔑 **Zero-Trust ECDSA Cryptography**: Every NFC tag payload is signed with a patient-specific ECDSA P-256 private key stored in non-extractable IndexedDB. A two-tier authority certification system prevents tag spoofing.
- 🔄 **JWT Refresh & Revocation**: Short-lived 15-minute Access Tokens + 7-day Refresh Tokens with server-side revocation on logout.
- 🛡️ **End-to-End Input Validation**: All API endpoints protected by Zod schema validation, rate limiting, and role-based + medical consent access gates.
- 📱 **Offline-First Resilience**: Designed to operate without network connectivity during disaster recovery or remote accidents.

---

## 🛠️ Architecture & Tech Stack

```
                                 ┌─────────────────────────┐
                                 │   Passive NFC Tag       │
                                 │   (NTAG215 / NTAG216)   │
                                 └───────────┬─────────────┘
                                             │ 13.56 MHz NDEF Scan
                                             ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                  LifeTag Application                                  │
│                                                                                        │
│   ┌────────────────────────┐  ┌────────────────────────┐  ┌─────────────────────────┐   │
│   │   NFC Hardware Tools   │  │   Emergency Triage     │  │   Doctor Medical Portal │   │
│   │   (TagTracer Engine)   │  │   (First Responder)    │  │   (AuthGuard Protected) │   │
│   └──────────┬─────────────┘  └───────────┬────────────┘  └───────────┬─────────────┘   │
│              │                            │                           │                 │
│   ┌──────────▼────────────────────────────▼───────────────────────────▼────────────┐   │
│   │                   LifeTag Node.js / Express REST API (v1)                      │   │
│   │                   (Controllers ➔ Services ➔ Repositories)                      │   │
│   └───────────────────────────────────────┬────────────────────────────────────────┘   │
│                                           │                                            │
│   ┌───────────────────────────────────────▼────────────────────────────────────────┐   │
│   │                   PostgreSQL Database (via Prisma ORM)                         │   │
│   └────────────────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────────────────┘

> 📘 **See the full [Security Architecture](docs/security_architecture.md)** for details on the dual-token JWT flow and cryptographic trust chain.
```

- **Frontend Core**: React 18, Vite 5, TypeScript 5, React Router DOM v6
- **UI & Styling**: Tailwind CSS, Radix UI Primitives, Lucide Icons, Sonner notifications
- **Hardware Integration**: W3C Web NFC API (`NDEFReader`)
- **Backend API**: Node.js, Express, TypeScript, Zod Validation
- **Database & Data Management**: PostgreSQL, Prisma ORM, TanStack React Query v5

---

## 📦 Getting Started

### Prerequisites
- Node.js (v18.x or higher)
- npm (v9.x or higher)
- PostgreSQL (Native installation OR Docker Desktop)
- Chrome for Android / Web NFC capable mobile browser for hardware testing

### Installation & Run

1. Clone the repository:
   ```bash
   git clone https://github.com/nh-44/lifetag.git
   cd lifetag
   ```

2. Setup the Backend:
   ```bash
   cd server
   npm install
   # Configure your PostgreSQL database URL in the .env file:
   # Option A (Native Postgres): DATABASE_URL="postgresql://username:password@localhost:5432/database_name"
   # Option B (Docker Postgres): DATABASE_URL="postgresql://username:password@localhost:5433/database_name"
   npm run prisma:generate
   npx prisma db push
   npm run db:seed
   npm run dev
   ```

3. Setup the Frontend (in a new terminal):
   ```bash
   cd client
   npm install
   npm run dev
   ```

4. Build for production:
   ```bash
   # Build frontend
   cd client && npm run build
   
   # Build backend
   cd ../server && npm run build
   ```

---

## 📌 Project Improvement & Modernization Roadmap

The consolidated project is scheduled for next-generation architectural enhancements:

### 1. AES-GCM 256 Payload Encryption
- Encrypt sensitive medical histories directly onto NFC payload blocks accessible only via authorized key pairs.

### 2. WebAuthn & Passkey Hardware Authentication
- Replace password logins for medical practitioners with biometric WebAuthn / FIDO2 authentication tied to verified doctor credentials.

### 3. PWA Service Worker & Offline Sync
- Package LifeTag as an installable Progressive Web App (PWA) using local offline scan history synchronization.

---

## 🎓 Academic Research Paper Roadmap

This codebase serves as the reference implementation for an upcoming research paper aimed at top-tier digital health and security venues (*IEEE EMBC*, *ACM CHIL*, *IEEE JBHI*):

> **Title**: *"LifeTag: A Decentralized, Offline-Resilient Emergency Health Data Protocol using Standardized Web NFC and Zero-Trust Asymmetric Cryptography"*

### Research Contributions:
- **Off-Grid Emergency Data Protocol**: Packing tamper-proof FHIR-compliant triage summaries into constrained NDEF capacity (< 504 bytes).
- **Dual-Tier Triage Access Model**: Empirical latency evaluation of offline NDEF scanning vs. cloud API lookups.
- **Micro-Benchmark Datasets**: Read/write success rates across physical distances and tag shielding.

---

## 📄 License
This project is released under the MIT License.
