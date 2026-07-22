# LifeTag - Folder Structure

This document outlines the comprehensive folder structure for the LifeTag project. It serves as a navigational guide for developers to understand the separation of concerns, the architectural patterns applied (like Clean Architecture in the backend), and where to locate specific components across both the React frontend and the Express/Prisma backend.

## Root Folder Structure
```
lifetag/
├── client/                         # React + Vite frontend
├── docs/                           # Project Documentation
├── server/                         # Express + Prisma backend
├── .gitignore                      # Repository Git ignore rules
├── README.md                       # Project overview & setup guide
```

## Frontend / Client Folder Structure 

```
client/
├── components.json                     # Shadcn UI configuration file
├── index.html                          # Entry HTML document
├── package.json                        # NPM dependencies, scripts, and metadata
├── postcss.config.js                   # PostCSS pipeline plugins (Tailwind, Autoprefixer)
├── tailwind.config.ts                  # Tailwind CSS custom theme and color tokens
├── tsconfig.json                       # Base TypeScript configuration
├── tsconfig.app.json                   # Application-specific TS compilation configuration
├── tsconfig.node.json                  # Node environment TS configuration
├── vite.config.ts                      # Vite build runner setup with alias rules
└── src/
    ├── App.css                         # Custom layout utility CSS
    ├── App.tsx                         # Application root layout, routes, and context providers
    ├── index.css                       # Global CSS, Tailwind directives, and root theme vars
    ├── main.tsx                        # DOM mounting entrypoint
    ├── vite-env.d.ts                   # Ambient Vite type definitions
    ├── components/
    │   ├── layout/
    │   │   ├── Header.tsx              # Top navigation bar with responsive drawer & auth menu
    │   │   └── Footer.tsx              # Global footer component
    │   ├── nfc/
    │   │   ├── AdminPanel.tsx          # Password-protected hardware programming modal
    │   │   ├── NfcInfo.tsx             # Card component showing scanned account ID and URL
    │   │   ├── NfcScanner.tsx          # Core Web NFC NDEF scanning and parsing engine
    │   │   ├── NfcWriter.tsx           # Core Web NFC NDEF text writing engine
    │   │   └── ScanHistory.tsx         # Audit log table displaying recent NFC scans
    │   └── ui/                         # Radix UI wrapper components (button, card, dialog, etc.)
    ├── contexts/
    │   └── AuthContext.tsx             # Authentication provider, session state, and login logic
    ├── hooks/
    │   ├── use-mobile.tsx              # Responsive viewport breakpoint detection hook
    │   └── use-toast.ts                # Toast notification state hook
    ├── lib/
    │   └── utils.ts                    # Utility function for merging Tailwind classes (`cn`)
    ├── pages/
    │   ├── AccountInfo.tsx             # User account configuration view
    │   ├── EditProfile.tsx             # Multi-tab profile management form
    │   ├── EmergencyInfo.tsx           # First-responder triage view (filtered public data)
    │   ├── Home.tsx                    # Landing page with CTA buttons and features overview
    │   ├── Index.tsx                   # Alternative entry point page
    │   ├── Login.tsx                   # Authentication view with role-aware redirection
    │   ├── MedicalInfo.tsx             # Doctor medical portal (unfiltered deep health records)
    │   ├── MyContacts.tsx              # Emergency contacts manager view
    │   ├── MyDoctor.tsx                # Primary physician linkage view
    │   ├── NotFound.tsx                # 404 route component
    │   ├── Signup.tsx                  # Registration form with role selector
    │   ├── TagTracer.tsx               # NFC hardware scanner and writer admin page
    │   └── Unauthorized.tsx            # 403 authorization boundary page
    ├── services/
    │   ├── api.ts                      # REST API client declarations and mock fallbacks
    │   ├── dbService.ts                # MongoDB Atlas Data API transport layer
    │   ├── nfcCryptoService.ts         # Cryptographic payload signing and NTAG size checker
    │   ├── seedData.ts                 # Offline seed data populator
    │   └── userService.ts              # Main data access repository and profile management
    └── types/
        ├── index.ts                    # TypeScript models, unions, and payload interfaces
        └── user.ts                     # Re-export gateway for user domain models
```


## Backend / Server Folder Structure
```
server/
├── prisma/
│   ├── schema.prisma                                   # PostgreSQL relational models & Enums
│   ├── migrations/                                     # Automated migration history tracking
│   └── seed.ts                                         # Seed script for development users and sample data
├── src/
│   ├── config/                                         # Infrastructure Configuration
│   │   ├── env.ts                                      # Zod environment variable validator 
│   │   └── database.ts                                 # Shared PrismaClient instance
│   ├── constants/                                      # Application Enums & Error Code Constants
│   │   ├── roles.ts                                    # UserRole: USER, DOCTOR, FIRST_RESPONDER
│   │   └── errorCodes.ts                               # Standardized error code strings
│   ├── types/                                          # Custom TypeScript Types & Express Extensions
│   │   ├── auth.types.ts                               # JWT payload & Session user definitions
│   │   ├── patient.types.ts                            # Redacted Emergency vs Full Medical profile DTOs
│   │   └── express.d.ts                                # Extension for req.user in Express Request
│   ├── middlewares/                                    # Cross-Cutting Concerns & Interceptors
│   │   ├── auth.middleware.ts                          # JWT authentication middleware
│   │   ├── rbac.middleware.ts                          # Role-based access control guard
│   │   ├── validate.middleware.ts                      # Zod schema validation middleware
│   │   └── error.middleware.ts                         # Global error handling middleware
│   ├── utils/                                          # Helper Functions
│   │   ├── crypto.utils.ts                             # ECDSA digital signature & bitwise hash helpers
│   │   ├── password.utils.ts                           # Argon2 / Bcrypt password hashing & verification
│   │   └── response.utils.ts                           # Standardized API response formatters
│   ├── repositories/                                   # Data Access Layer (Prisma Queries)
│   │   ├── interfaces/                                 # Abstract Repository Interfaces
│   │   │   ├── user.repository.interface.ts
│   │   │   ├── doctor.repository.interface.ts
│   │   │   ├── firstResponder.repository.interface.ts
│   │   │   └── triage.repository.interface.ts
│   │   ├── user.repository.ts                          # Prisma execution for User/Patient queries
│   │   ├── doctor.repository.ts                        # Prisma execution for Doctor records
│   │   ├── firstResponder.repository.ts
│   │   └── triage.repository.ts                        # Prisma execution for Emergency & Medical Records
│   ├── services/                                       # Business Logic Layer
│   │   ├── auth.service.ts                             # Authentication, signup validation, token issuance
│   │   ├── patient.service.ts                          # Patient account management
│   │   ├── triage.service.ts                           # EMT Triage lookup & data stripping logic
│   │   ├── doctor.service.ts                           # Unredacted medical record access for doctors
│   │   └── nfc.service.ts                              # NFC payload generation, signing, & size validation
│   ├── controllers/                                    # HTTP Request Controllers
│   │   ├── auth.controller.ts                          # Login & Signup HTTP handlers
│   │   ├── patient.controller.ts                       # Profile update handlers
│   │   ├── triage.controller.ts                        # Emergency Info (/api/v1/triage/:accountId)
│   │   ├── medical.controller.ts                       # Doctor Medical Info (/api/v1/medical/:accountId)
│   │   └── nfc.controller.ts                           # NFC Tag generation handlers
│   ├── routes/                                         # Express Router Definitions
│   │   └── v1/
│   │       ├── index.ts                                # Main v1 router aggregator
│   │       ├── auth.routes.ts                          # Auth endpoints
│   │       ├── patient.routes.ts                       # Patient profile endpoints
│   │       ├── triage.routes.ts                        # Triage lookup endpoints (FIRST_RESPONDER guard)
│   │       ├── medical.routes.ts                       # Deep medical endpoints (DOCTOR guard)
│   │       └── nfc.routes.ts                           # NFC hardware toolkit endpoints
│   ├── app.ts                                          # Express app setup
│   └── server.ts                                       # HTTP server listener entrypoint
├── .env.example                                        # Environment variable template
├── .eslintrc.json                                      # ESLint configuration
├── tsconfig.json                                       # TypeScript compiler options
└── package.json                                        # Backend dependencies & npm scripts
```