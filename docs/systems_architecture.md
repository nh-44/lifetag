# LifeTag Systems Architecture

## Overview
LifeTag is a consolidated emergency medical profile application backed by a decentralized NFC hardware toolkit. The platform guarantees offline-resilient access to critical triage data (blood group, allergies, DNR status) for first responders while securing sensitive medical history under strict Role-Based Access Control (RBAC).

## Architecture Stack

### Backend Data Layer (API & Database)
- **Runtime:** Node.js with Express.js
- **Language:** TypeScript 
- **Database:** PostgreSQL (Containerized via Docker)
- **ORM:** Prisma
- **Security:** Helmet, express-rate-limit, JWT-based Authentication

### Frontend UI & NFC Layer
- **Core:** React 18, Vite 5, TypeScript
- **Styling:** Tailwind CSS, Radix UI Primitives
- **State Management:** TanStack React Query
- **Hardware Integration:** W3C Web NFC API (`NDEFReader`)

---

## Security & Authorization Model

The application enforces strict separation of concerns through specialized REST middlewares and relational modeling.

### 1. Role-Based Access Control (RBAC)
User actions are strictly guarded by JWT payloads containing assigned roles:
- `USER` (Patient): Can edit their own emergency profile and medical history.
- `DOCTOR`: Can view full medical records *only if* granted consent.
- `FIRST_RESPONDER`: Restricted to viewing triage metrics during emergency scans.

### 2. Medical Consent Logic (Zero-Trust)
Access to a patient's `/api/v1/patients/medical/:accountId` endpoint is intercepted by the `requireMedicalConsent` middleware. This layer rejects access unless:
- The Doctor is explicitly assigned as the patient's `primaryPhysician`.
- A verified emergency scan (`ScanAuditLog`) was recorded by that doctor within the last 24 hours.

### 3. Rate Limiting
To prevent brute-force attacks and DDOS attempts:
- **Global API Limiter:** 100 requests / 15 minutes across all `/api/v1` routes.
- **Strict Auth Limiter:** 10 requests / 15 minutes specifically targeting `/login` and `/signup`.

---

## Entity-Relationship Model (ERD)

The PostgreSQL database is structured around five core models managed via Prisma:

1. **User:** Core authentication model representing patients.
2. **DoctorProfile & FirstResponderProfile:** Specialized tables storing medical licenses and agency IDs.
3. **TriageProfile:** High-availability table designed for rapid JSON serialization to NFC tags.
4. **MedicalHistory:** Secure table storing highly sensitive data (surgeries, habits, checkups).
5. **ScanAuditLog:** Immutable ledger tracking every instance a patient's NFC tag is scanned by a medical professional.

---

## Deployment & Containerization

The backend utilizes **Docker Compose** to containerize the PostgreSQL database (`postgres:14-alpine`), ensuring local developer environments remain consistent and avoiding schema permission conflicts. The Express API maps dynamically to the Docker container over port `5433`, leaving host ports unpolluted.
