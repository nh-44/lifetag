/**
 * Healthcare Authority operator tool: verify (or revoke) a clinician account.
 * Self-registered DR/FR accounts cannot issue tags, log scans or read records until
 * verified here, after the operator has checked the licence / agency credentials.
 *
 *   cd server
 *   npx ts-node scripts/verify-clinician.ts DR12345            # verify
 *   npx ts-node scripts/verify-clinician.ts DR12345 --revoke   # revoke verification
 *   npx ts-node scripts/verify-clinician.ts --list             # list unverified clinicians
 *
 * Uses DATABASE_URL from server/.env.
 */
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
const prisma = new PrismaClient();

async function main() {
  const [arg, flag] = process.argv.slice(2);

  if (arg === '--list') {
    const [doctors, responders] = await Promise.all([
      prisma.doctorProfile.findMany({ where: { verified: false }, select: { userId: true, name: true, medicalLicenseNumber: true, hospitalClinic: true } }),
      prisma.firstResponderProfile.findMany({ where: { verified: false }, select: { userId: true, name: true, agency: true, agencyId: true } }),
    ]);
    console.table([...doctors, ...responders]);
    return;
  }

  if (!arg || !/^(DR|FR)\d{5}$/.test(arg)) {
    console.error('Usage: verify-clinician.ts <DRxxxxx|FRxxxxx> [--revoke] | --list');
    process.exit(1);
  }

  const verified = flag !== '--revoke';
  const data = { verified, verifiedAt: verified ? new Date() : null };
  const updated = arg.startsWith('DR')
    ? await prisma.doctorProfile.update({ where: { userId: arg }, data })
    : await prisma.firstResponderProfile.update({ where: { userId: arg }, data });
  console.log(`${updated.userId} (${updated.name}) is now ${verified ? 'VERIFIED' : 'UNVERIFIED'}.`);
}

main()
  .catch((e) => {
    console.error(e.code === 'P2025' ? 'No such clinician account.' : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
