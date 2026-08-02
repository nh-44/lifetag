# Starter Guide — Nandita (Frontend UI Lead)

Welcome to your LifeTag workload starter page. This document outlines your exact UI development tasks, coding guidelines, and integration interfaces.

---

## 🛠️ Workload & Goals
1. **Patient Profile Form**: Implement multi-tab state management in [EditProfile.tsx](file:///e:/Hackathons%20,%20CODMAV%20,%20etc/LifeTag/client/src/pages/EditProfile.tsx).
2. **First-Responder Emergency Card**: Create the public-facing EMT layout in [EmergencyInfo.tsx](file:///e:/Hackathons%20,%20CODMAV%20,%20etc/LifeTag/client/src/pages/EmergencyInfo.tsx) showing blood types, allergies, contacts, and DNR badges.
3. **Responsive Navigation & Layout**: Manage [Header.tsx](file:///e:/Hackathons%20,%20CODMAV%20,%20etc/LifeTag/client/src/components/layout/Header.tsx) user menus, role switcher displays, and mobile side drawers.
4. **Offline UX Indicators**: Add UI banner indicators showing if the client has offline access.

---

## 📋 Naming Schemes & Coding Guidelines
- **Components**: Use `PascalCase` matching file names (e.g., `EmergencyInfo`, `EditProfileForm`).
- **Styling**: Leverage standard Tailwind utility classes; do not use arbitrary utility overrides when layout tokens exist.
- **Vite Config Alias**: Use `@/` to import files from the `client/src` directory (e.g., `import { Button } from '@/components/ui/button'`).

---

## 🔑 Common Information
- **Client Dev URL**: `http://localhost:8080`
- **Backend API URL**: `http://localhost:9000/api/v1`
- **Auth Tokens**: Read from `localStorage` under `lifetag_token`.

---

## 🏁 Immediate Starter Steps
1. Navigate to the `client/` directory and run `npm run dev`.
2. Inspect [Header.tsx](file:///e:/Hackathons%20,%20CODMAV%20,%20etc/LifeTag/client/src/components/layout/Header.tsx) and integrate a role display (User, Doctor, First Responder) corresponding to the currently authenticated user.
3. Wire the profile save handler in [EditProfile.tsx](file:///e:/Hackathons%20,%20CODMAV%20,%20etc/LifeTag/client/src/pages/EditProfile.tsx) to execute API calls from `client/src/services/userService.ts`.
