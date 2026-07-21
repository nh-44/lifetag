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
│   └────────────────────────┘  └────────────────────────┘  └─────────────────────────┘   │
│                                                                                        │
│   ┌────────────────────────────────────────────────────────────────────────────────┐   │
│   │               Cryptographic Verification Engine (NfcCryptoService)             │   │
│   └────────────────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Frontend Core**: React 18, Vite 5, TypeScript 5, React Router DOM v6
- **UI & Styling**: Tailwind CSS, Radix UI Primitives, Lucide Icons, Sonner notifications
- **Hardware Integration**: W3C Web NFC API (`NDEFReader`)
- **State & Data Management**: TanStack React Query v5

---

## 📦 Getting Started

### Prerequisites
- Node.js (v18.x or higher)
- npm (v9.x or higher)
- Chrome for Android / Web NFC capable mobile browser for hardware testing

### Installation & Run

1. Clone the repository:
   ```bash
   git clone https://github.com/nh-44/lifetag.git
   cd lifetag
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Launch local development server:
   ```bash
   npm run dev
   ```

4. Build for production:
   ```bash
   npm run build
   ```

---

## 📌 Project Improvement & Modernization Roadmap

The consolidated project is scheduled for next-generation architectural enhancements:

### 1. Zero-Trust Asymmetric On-Tag Cryptography
- **ECDSA P-256 Digital Signatures**: Append tamper-evident cryptographic signatures to NDEF payloads, allowing offline verification of tag authenticity without database calls.
- **AES-GCM 256 Payload Encryption**: Encrypt sensitive medical histories directly onto NFC payload blocks accessible only via authorized key pairs.

### 2. HL7 FHIR Standard Compliance
- Structure patient triage records using standardized **HL7 FHIR Patient** and **AllergyIntolerance** JSON schemas for universal hospital EMR interoperability.

### 3. WebAuthn & Passkey Hardware Authentication
- Replace password logins for medical practitioners with biometric WebAuthn / FIDO2 authentication tied to verified doctor credentials.

### 4. PWA Service Worker & Offline Sync
- Package LifeTag as an installable Progressive Web App (PWA) using IndexedDB for local offline scan history synchronization.

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
