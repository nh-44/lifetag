# Starter Guide — Preksha (Backend Lead)

Welcome to your LifeTag workload starter page. This document outlines your exact database, API, and service layer development tasks, coding guidelines, and integration interfaces.

---

## 🛠️ Workload & Goals
1. **Prisma Database Modeling**: Configure schemas for `User`, `TriageProfile`, `MedicalHistory`, and `ScanAuditLog`.
2. **JWT & Role-Based Middleware**: Implement request authorization blocks for Doctor (`DOCTOR`) and First Responder (`FIRST_RESPONDER`) privileges.
3. **Endpoint Development**: Secure backend router logic mapping triage records and doctor portals.
4. **Audit Logging**: Intercept incoming triage reads to insert tracking entries in `ScanAuditLog`.

---

## 📋 Naming Schemes & Coding Guidelines
- **API Endpoints**: Use lower `kebab-case` and structure logically under REST conventions:
  - `/api/v1/auth/login`
  - `/api/v1/patients/triage/:accountId`
  - `/api/v1/patients/medical/:accountId`
- **Database Tables & Fields**: Use `camelCase` for fields and `PascalCase` for model tables in `schema.prisma`.
- **Response Format**: Wrap all controller responses in the standardized JSON envelope:
  ```json
  {
    "success": true,
    "data": { ... }
  }
  ```

---

## 🔑 Common Information
- **Local Dev Server**: Launches on port `9000` via `npm run dev` in `server/`.
- **Prisma Studio**: Launch using `npx prisma studio` to inspect local datasets.
- **Database Connection**: Configured in `server/.env` via `DATABASE_URL`.

---

## 🏁 Immediate Starter Steps
1. Navigate to the `server/` directory and configure your local PostgreSQL database url in `server/.env`.
2. Run Prisma migration commands to initialize tables:
   ```bash
   npx prisma migrate dev --name init
   ```
3. Run the backend seed file to establish default accounts:
   ```bash
   npm run seed
   ```
4. Review the controller logic in `server/src/controllers/patient.controller.ts` to verify how database queries redact sensitive medical records for EMT requests.
