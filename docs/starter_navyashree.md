# Starter Guide — Navyashree (NFC Hardware API, Doctor Portal & QA)

Welcome to your LifeTag workload starter page. This document outlines your exact browser hardware, testing, and portal development tasks, coding guidelines, and integration interfaces.

---

## 🛠️ Workload & Goals
1. **Web NFC Scanning Integration**: Wire `NDEFReader` events to decode text records and trigger React application state updates in [NfcScanner.tsx](file:///e:/Hackathons%20,%20CODMAV%20,%20etc/LifeTag/client/src/components/nfc/NfcScanner.tsx).
2. **NFC Tag Writer Controls**: Build [NfcWriter.tsx](file:///e:/Hackathons%20,%20CODMAV%20,%20etc/LifeTag/client/src/components/nfc/NfcWriter.tsx) to record patient identifiers onto passive physical tags.
3. **Scan Audit UI Logs**: Display local histories matching scanned profiles.
4. **Validation Test Suite**: Maintain client and server test routines ensuring zero regressions.

---

## 📋 Naming Schemes & Coding Guidelines
- **NFC Event Hooks**: Wrap Web NFC standard handlers inside clear async calls (e.g., `startNdefReading`, `writeNdefPayload`).
- **Test Specs**: Name file tests with the `.test.ts` or `.spec.tsx` suffix.
- **TypeScript Compliance**: Leverage ambient global types declared in `client/src/vite-env.d.ts` when resolving W3C standard definitions.

---

## 🔑 Common Information
- **Client Dev URL**: `http://localhost:8080`
- **Backend API URL**: `http://localhost:9000/api/v1`
- **NDEF Capabilities**: Requires Web NFC flag enabled on Chrome Mobile (Android) or local dev over HTTPS/Localhost.

---

## 🏁 Immediate Starter Steps
1. Review the native scanning callback structure in [NfcScanner.tsx](file:///e:/Hackathons%20,%20CODMAV%20,%20etc/LifeTag/client/src/components/nfc/NfcScanner.tsx).
2. Establish a simulated mock tag scan for testing purposes when running the app in desktop environments without physical NFC readers.
3. Run the Vitest client testing command in the `client/` workspace to verify the test environment is fully active:
   ```bash
   npm run test
   ```
