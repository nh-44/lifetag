import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AccessLogPanel from '@/components/profile/AccessLogPanel';
import VerificationBanner from '@/components/layout/VerificationBanner';
import { getMyAccessLog } from '@/services/userService';
import { fetchWithAuth } from '@/services/api';

vi.mock('@/services/userService', () => ({ getMyAccessLog: vi.fn() }));
vi.mock('@/services/api', () => ({ fetchWithAuth: vi.fn() }));
let user: any = null;
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ currentUser: user }) }));

describe('AccessLogPanel', () => {
  it('lists scans and lookups, highlighting use of a revoked tag', async () => {
    vi.mocked(getMyAccessLog).mockResolvedValue([
      { timestamp: '2026-11-01T10:00:00Z', scannedBy: 'FR55555', scannerName: 'Paramedic Bob', organization: 'Metro EMS', accessType: 'tag-scan', certified: false, tagFreshness: 'revoked' },
      { timestamp: '2026-11-01T09:00:00Z', scannedBy: 'DR98765', scannerName: 'Dr. House', organization: 'PPTH', accessType: 'online-lookup', certified: false, tagFreshness: null },
    ]);
    render(<AccessLogPanel />);
    expect(await screen.findByText('Scanned a REVOKED tag of yours')).toBeInTheDocument();
    expect(screen.getByText('Looked up your triage record online')).toBeInTheDocument();
    expect(screen.getByText(/Paramedic Bob, Metro EMS/)).toBeInTheDocument();
  });

  it('says so when nobody has accessed the record', async () => {
    vi.mocked(getMyAccessLog).mockResolvedValue([]);
    render(<AccessLogPanel />);
    expect(await screen.findByText(/No clinician has scanned/)).toBeInTheDocument();
  });
});

describe('VerificationBanner', () => {
  beforeEach(() => vi.clearAllMocks());

  it('warns an unverified clinician, using fresh status from the server', async () => {
    user = { userId: 'DR1', name: 'D', role: 'DOCTOR', verified: true }; // stale local value
    vi.mocked(fetchWithAuth).mockResolvedValue({ success: true, data: { verified: false } });
    render(<VerificationBanner />);
    expect(await screen.findByRole('status')).toHaveTextContent(/awaiting verification/);
    expect(fetchWithAuth).toHaveBeenCalledWith('/doctors/me');
  });

  it('disappears once the server reports the account verified', async () => {
    user = { userId: 'FR1', name: 'F', role: 'FIRST_RESPONDER', verified: false };
    vi.mocked(fetchWithAuth).mockResolvedValue({ success: true, data: { verified: true } });
    render(<VerificationBanner />);
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('never shows for patients', () => {
    user = { userId: 'US1', name: 'P', role: 'USER' };
    render(<VerificationBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(fetchWithAuth).not.toHaveBeenCalled();
  });
});
