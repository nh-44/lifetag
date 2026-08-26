import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import NfcInfo from '@/components/nfc/NfcInfo';

import { toast } from 'sonner';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() }
}));

describe('NfcInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });
  it('renders nothing when accountId or url is missing', () => {
    const { container } = render(<NfcInfo accountId={null} url={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders scanned account information', () => {
    render(<NfcInfo accountId="12345" url="http://localhost:8080/emergency-info/12345" />);
    
    expect(screen.getByText('Last Scanned Tag')).toBeInTheDocument();
    expect(screen.getByText('12345')).toBeInTheDocument();
    expect(screen.getByText('http://localhost:8080/emergency-info/12345')).toBeInTheDocument();
  });

  it('Open Profile navigation passes the raw tagPayload through React Router state correctly', () => {
    const mockPayload = { fhirPatientId: '12345', version: '2.0' as const, timestamp: 'xyz', triageData: {} as any, tagId: 'abc', signature: 'xyz' };
    render(<NfcInfo accountId="12345" url="http://localhost:8080/emergency-info/12345" payload={mockPayload} />);
    
    const openUrlBtn = screen.getByTitle('Open URL');
    fireEvent.click(openUrlBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/emergency-info/12345', {
      state: { tagPayload: mockPayload }
    });
  });

  it('copies account ID and URL to clipboard', async () => {
    render(<NfcInfo accountId="12345" url="http://localhost:8080/emergency-info/12345" />);
    
    const copyAccountIdBtn = screen.getByTitle('Copy Account ID');
    fireEvent.click(copyAccountIdBtn);
    
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('12345');
    expect(toast.success).toHaveBeenCalledWith('Account ID copied to clipboard');

    const copyUrlBtn = screen.getByTitle('Copy URL');
    fireEvent.click(copyUrlBtn);
    
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost:8080/emergency-info/12345');
    expect(toast.success).toHaveBeenCalledWith('URL copied to clipboard');
  });
});
