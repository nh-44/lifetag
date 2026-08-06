import crypto from 'crypto';
import { CryptoUtils } from './crypto.utils';
import { NfcService, TriagePayload } from '../services/nfc.service';

/**
 * Automated Security Validation Test
 * Asserts cryptographic protection mechanisms, tampered payload detections,
 * and key certificate hierarchy checks.
 */

const samplePayload: TriagePayload = {
  version: '2.0',
  timestamp: new Date().toISOString(),
  fhirPatientId: 'FHIR-PATIENT-9923412',
  tagId: '',
  triageData: {
    name: 'John Doe',
    bloodGroup: 'O-Negative',
    allergies: ['Penicillin'],
    emergencyContacts: [
      { userId: 'US98234', name: 'Jane Doe' }
    ],
    dnrStatus: true,
  },
  signature: '',
};

function runSecurityTests() {
  console.log(`\n======================================================`);
  console.log(`Running LifeTag Server Cryptographic Security Test Suite`);
  console.log(`======================================================\n`);

  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, testName: string) => {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      failed++;
    }
  };

  try {
    // Test 1: Generate valid keys and signature
    const patientKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const patientPublicKeyJwk = patientKeys.publicKey.export({ format: 'jwk' });
    
    const triageDataBytes = Buffer.from(JSON.stringify(samplePayload.triageData));
    const signer = crypto.createSign('SHA256');
    signer.update(triageDataBytes);
    const signature = signer.sign(patientKeys.privateKey).toString('base64');

    const validPayload: TriagePayload = {
      ...samplePayload,
      tagId: JSON.stringify(patientPublicKeyJwk),
      signature
    };

    // Test 1.1: Verify valid signature returns true
    const { verified: isVerifiedNormal } = NfcService.verifyTagIntegrity(validPayload);
    assert(isVerifiedNormal === true, 'Verifying intact triage signature');

    // Test 2: Tamper with patient data (e.g. modify bloodGroup)
    const tamperedPayload: TriagePayload = {
      ...validPayload,
      triageData: {
        ...validPayload.triageData,
        bloodGroup: 'A-Positive' // TAMPERED!
      }
    };
    const { verified: isVerifiedTampered } = NfcService.verifyTagIntegrity(tamperedPayload);
    assert(isVerifiedTampered === false, 'Detecting tampered triage data (Modified Blood Group)');

    // Test 3: Unsigned payloads must fail validation
    const unsignedPayload: TriagePayload = {
      ...samplePayload,
      tagId: JSON.stringify(patientPublicKeyJwk),
      signature: '' // MISSING!
    };
    const { verified: isVerifiedUnsigned } = NfcService.verifyTagIntegrity(unsignedPayload);
    assert(isVerifiedUnsigned === false, 'Rejecting unsigned tag payload');

    // Test 4: Certification Authority Validation
    const authoritySignature = CryptoUtils.signWithAuthorityKey(validPayload.tagId);
    const certifiedPayload: TriagePayload = {
      ...validPayload,
      authoritySignature
    };

    // Test 4.1: Certified key validation
    const { verified: isCertVerified, trustedAuthority: isTrusted } = NfcService.verifyTagIntegrity(certifiedPayload);
    assert(isCertVerified === true && isTrusted === true, 'Verifying Healthcare Authority Certified Key Certificate');

    // Test 4.2: Self-signed key validation
    const { verified: isSelfVerified, trustedAuthority: isSelfTrusted } = NfcService.verifyTagIntegrity(validPayload);
    assert(isSelfVerified === true && isSelfTrusted === false, 'Identifying Self-Signed/Uncertified Key Certificate');

  } catch (e: any) {
    console.error('Test execution encountered an unhandled error:', e);
    failed++;
  }

  console.log(`\n======================================================`);
  console.log(`Security Test Results: ${passed} passed, ${failed} failed`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityTests();
