# LifeTag - LLM Developer & Architecture Guide

This document is designed for LLMs (and developers) to quickly understand the LifeTag repository structure, codebase architecture, schema definitions, and design patterns. Read this first before modifying or adding features to this workspace.

---

## 🏗️ System Architecture Overview

LifeTag is a full-stack, decoupled monorepo composed of a modern frontend client and a secure, audited Express backend.

```
                  ┌───────────────────────────────┐
                  │        React Frontend         │
                  │   Vite + TypeScript + Tailwind │
                  └───────────────┬───────────────┘
                                  │ HTTPS REST / JSON
                                  ▼
                  ┌───────────────────────────────┐
                  │        Express Backend        │
                  │  Clean Architecture Layering  │
                  └───────────────┬───────────────┘
                                  │ Prisma ORM
                                  ▼
                  ┌───────────────────────────────┐
                  │      PostgreSQL Database      │
                  │   Emergency & Medical Data    │
                  └───────────────────────────────┘
```

---

## 🗄️ Database Schema & Models (`server/prisma/schema.prisma`)

We split patient records into public triage details and protected medical history to implement strict role-based access control (RBAC).

1. **User (Role: `USER`)**: Core account model representing patients. Relates to one `TriageProfile` and one `MedicalHistory`.
2. **DoctorProfile (Role: `DOCTOR`)**: Contains credentials, clinic affiliation, and medical license details.
3. **FirstResponderProfile (Role: `FIRST_RESPONDER`)**: Agency info and qualification details.
4. **TriageProfile**: Publicly available vital summary (Blood Group, Allergies, Emergency Contacts, DNR, Organ Donor status).
5. **MedicalHistory**: Sensitive restricted history (Medications, Surgeries, Illnesses, habits, BP/sugar checks).
6. **ScanAuditLog**: Logs scanned patient accounts, matching scanner ID, timestamp, and device metadata.

---

## 📂 Key Files Directory

### 💻 Client Directory (`client/`)
- [package.json](file:///e:/Hackathons%20,%20CODMAV%20,%20etc/LifeTag/client/package.json): Frontend dependencies (Tailwind, Lucide React, Radix UI primitives, Sonner, React Query, React Router DOM).
- [src/main.tsx](file:///e:/Hackathons%20,%20CODMAV%20,%20etc/LifeTag/client/src/main.tsx): Client entrypoint mounting the React DOM.
- [src/App.tsx](file:///e:/Hackathons%20,%20CODMAV%20,%20etc/LifeTag/client/src/App.tsx): Main router definition, including theme/query/auth context wrappers.
- [src/vite-env.d.ts](file:///e:/Hackathons%20,%20CODMAV%20,%20etc/LifeTag/client/src/vite-env.d.ts): Ambient TypeScript overrides for the browser native `NDEFReader` / Web NFC API.
- **Components**:
  - [src/components/auth/AuthGuard.tsx](file:///e:/Hackathons%20,%20CODMAV%20,%20etc/LifeTag/client/src/components/auth/AuthGuard.tsx): Guard component handling role-based client-side route protection.
  - [src/components/nfc/NfcScanner.tsx](file:///e:/Hackathons%20,%20CODMAV%20,%20etc/LifeTag/client/src/components/nfc/NfcScanner.tsx): Handles starting `NDEFReader`, parsing Text records, extracting 5-digit account IDs, and firing the scan success handler.
  - [src/components/nfc/NfcWriter.tsx](file:///e:/Hackathons%20,%20CODMAV%20,%20etc/LifeTag/client/src/components/nfc/NfcWriter.tsx): Programs passive NTAG chips with text payload containing patient IDs.
- **Pages**:
  - [src/pages/TagTracer.tsx](file:///e:/Hackathons%20,%20CODMAV%20,%20etc/LifeTag/client/src/pages/TagTracer.tsx): NFC Hardware Console for scanning, writing, and displaying scan audits.
  - [src/pages/EmergencyInfo.tsx](file:///e:/Hackathons%20,%20CODMAV%20,%20etc/LifeTag/client/src/pages/EmergencyInfo.tsx): Rendered view of public triage details for first responders.
  - [src/pages/MedicalInfo.tsx](file:///e:/Hackathons%20,%20CODMAV%20,%20etc/LifeTag/client/src/pages/MedicalInfo.tsx): Doctor's dashboard for detailed medical history.
- **Services**:
  - [src/services/api.ts](file:///e:/Hackathons%20,%20CODMAV%20,%20etc/LifeTag/client/src/services/api.ts): Configures base API requests adding bearer authorization tokens.
  - [src/services/userService.ts](file:///e:/Hackathons%20,%20CODMAV%20,%20etc/LifeTag/client/src/services/userService.ts): Maps UI endpoints to REST service functions.
  - [src/services/nfcCryptoService.ts](file:///e:/Hackathons%20,%20CODMAV%20,%20etc/LifeTag/client/src/services/nfcCryptoService.ts): Validates byte-size thresholds (< 504 bytes) for NTAG215 constraints.

### 🔌 Server Directory (`server/`)
- [src/app.ts](file:///e:/Hackathons%20,%20CODMAV%20,%20etc/LifeTag/server/src/app.ts): Express configuration containing middleware setups and CORS.
- [src/server.ts](file:///e:/Hackathons%20,%20CODMAV%20,%20etc/LifeTag/server/src/server.ts): Starts the HTTP listener.
- [src/config/database.ts](file:///e:/Hackathons%20,%20CODMAV%20,%20etc/LifeTag/server/src/config/database.ts): Instantiates the singleton `PrismaClient` for database queries.
- **Routes & Controllers**:
  - [src/routes/v1/patient.routes.ts](file:///e:/Hackathons%20,%20CODMAV%20,%20etc/LifeTag/server/src/routes/v1/patient.routes.ts): Maps patient routes with RBAC middlewares.
  - [src/controllers/patient.controller.ts](file:///e:/Hackathons%20,%20CODMAV%20,%20etc/LifeTag/server/src/controllers/patient.controller.ts): Handles requests, calling patient services and returning standardized responses.
- **Middlewares**:
  - [src/middlewares/auth.middleware.ts](file:///e:/Hackathons%20,%20CODMAV%20,%20etc/LifeTag/server/src/middlewares/auth.middleware.ts): Verifies JWT headers and attaches the authorized user payload to `req.user`.
  - [src/middlewares/rbac.middleware.ts](file:///e:/Hackathons%20,%20CODMAV%20,%20etc/LifeTag/server/src/middlewares/rbac.middleware.ts): Restricts endpoint access to specific roles (`USER`, `DOCTOR`, `FIRST_RESPONDER`).

---

## 🔒 Security Design Patterns

1. **Role-Based Middlewares (Express)**:
   Any protected route must use `authMiddleware` first, followed by `requireRole(...)`.
   Example:
   ```typescript
   router.get('/medical/:accountId', requireRole(Role.DOCTOR), patientController.getFullMedicalInfo);
   ```
2. **Access Redaction**:
   Never return `MedicalHistory` rows in emergency endpoints. EMTs have access to public `TriageProfile` fields only.
3. **Audit Trails**:
   Every time `/patients/triage/:accountId` or `/patients/medical/:accountId` are queried, a matching entry must be inserted into `ScanAuditLog` database table.
