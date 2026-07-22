-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'DOCTOR', 'FIRST_RESPONDER');

-- CreateEnum
CREATE TYPE "OrgType" AS ENUM ('GOVERNMENT', 'PRIVATE', 'GOVERNMENT_FUNDED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "contactInfo" TEXT NOT NULL,
    "medicalLicenseNumber" TEXT NOT NULL,
    "qualifications" TEXT[],
    "hospitalClinic" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoctorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FirstResponderProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "occupation" TEXT NOT NULL,
    "contactInfo" TEXT NOT NULL,
    "agency" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "organizationType" "OrgType" NOT NULL DEFAULT 'GOVERNMENT',
    "qualification" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FirstResponderProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriageProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "bloodGroup" TEXT NOT NULL,
    "allergies" TEXT[],
    "emergencyContacts" JSONB NOT NULL,
    "dnrStatus" BOOLEAN NOT NULL DEFAULT false,
    "organDonor" BOOLEAN NOT NULL DEFAULT false,
    "insuranceId" TEXT,
    "primaryPhysician" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TriageProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "drinkingHabits" TEXT,
    "smokingHabits" TEXT,
    "medications" TEXT[],
    "illnesses" TEXT[],
    "surgeries" TEXT[],
    "lastCheckup" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicalHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanAuditLog" (
    "id" TEXT NOT NULL,
    "scannedBy" TEXT NOT NULL,
    "patientAccount" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceMeta" TEXT,

    CONSTRAINT "ScanAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_userId_key" ON "User"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_accountId_key" ON "User"("accountId");

-- CreateIndex
CREATE INDEX "User_accountId_idx" ON "User"("accountId");

-- CreateIndex
CREATE INDEX "User_userId_idx" ON "User"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorProfile_userId_key" ON "DoctorProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorProfile_medicalLicenseNumber_key" ON "DoctorProfile"("medicalLicenseNumber");

-- CreateIndex
CREATE INDEX "DoctorProfile_userId_idx" ON "DoctorProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FirstResponderProfile_userId_key" ON "FirstResponderProfile"("userId");

-- CreateIndex
CREATE INDEX "FirstResponderProfile_userId_idx" ON "FirstResponderProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TriageProfile_userId_key" ON "TriageProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalHistory_userId_key" ON "MedicalHistory"("userId");

-- AddForeignKey
ALTER TABLE "TriageProfile" ADD CONSTRAINT "TriageProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalHistory" ADD CONSTRAINT "MedicalHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
