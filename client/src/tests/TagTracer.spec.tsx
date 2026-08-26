import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TagTracer from '@/pages/TagTracer';
import { toast } from 'sonner';

// Mock child components
vi.mock('@/components/nfc/NfcScanner', () => ({
  default: ({ isScanning, onScanComplete, onScanError }: any) => (
    <div data-testid="mock-nfc-scanner">
      {isScanning && <span data-testid="scanning-status">Scanning</span>}
      <button onClick={() => onScanComplete('12345')}>Mock Scan Success</button>
      <button onClick={() => onScanError('Scan failed')}>Mock Scan Error</button>
    </div>
  )
}));

vi.mock('@/components/nfc/AdminPanel', () => ({
  default: ({ onAuthChange }: any) => (
    <div data-testid="mock-admin-panel">
      <button onClick={() => onAuthChange(true)}>Mock Admin Login</button>
      <button onClick={() => onAuthChange(false)}>Mock Admin Logout</button>
    </div>
  )
}));

vi.mock('@/components/nfc/ScanHistory', () => ({
  default: ({ visible }: any) => (
    visible ? <div data-testid="mock-scan-history">History Visible</div> : null
  )
}));

vi.mock('@/components/nfc/NfcInfo', () => ({
  default: ({ accountId, url }: any) => (
    <div data-testid="mock-nfc-info">
      Info for {accountId} at {url}
    </div>
  )
}));

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}));

describe('TagTracer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders correctly', () => {
    render(<TagTracer />);
    expect(screen.getByText('Tag Tracer & NFC Tools')).toBeInTheDocument();
    expect(screen.getByTestId('mock-nfc-scanner')).toBeInTheDocument();
    expect(screen.getByTestId('mock-admin-panel')).toBeInTheDocument();
  });

  it('handles scan flow correctly', () => {
    render(<TagTracer />);
    
    // Initial state: not scanning, no info
    expect(screen.queryByTestId('scanning-status')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-nfc-info')).not.toBeInTheDocument();
    
    // Start scanning
    fireEvent.click(screen.getByRole('button', { name: 'Scan NFC Tag' }));
    expect(screen.getByTestId('scanning-status')).toBeInTheDocument();
    expect(toast.info).toHaveBeenCalledWith('Scanning for NFC tags...');
    
    // Simulate scan success
    fireEvent.click(screen.getByText('Mock Scan Success'));
    
    // Verify results
    expect(screen.queryByTestId('scanning-status')).not.toBeInTheDocument(); // Scanning stopped
    expect(screen.getByTestId('mock-nfc-info')).toHaveTextContent('Info for 12345');
    expect(toast.success).toHaveBeenCalledWith('NFC tag scanned successfully!');
    
    // Verify local storage history
    const history = JSON.parse(localStorage.getItem('scanHistory') || '[]');
    expect(history.length).toBe(1);
    expect(history[0].accountId).toBe('12345');
  });

  it('handles scan error correctly', () => {
    render(<TagTracer />);
    
    // Start scanning
    fireEvent.click(screen.getByRole('button', { name: 'Scan NFC Tag' }));
    
    // Simulate scan error
    fireEvent.click(screen.getByText('Mock Scan Error'));
    
    expect(screen.queryByTestId('scanning-status')).not.toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('Scan failed: Scan failed');
  });

  it('toggles scan history visibility only when admin', () => {
    render(<TagTracer />);
    
    // History button should not exist initially
    expect(screen.queryByRole('button', { name: 'Show History' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-scan-history')).not.toBeInTheDocument();
    
    // Login as admin
    fireEvent.click(screen.getByText('Mock Admin Login'));
    
    // Now the button should be visible
    const historyBtn = screen.getByRole('button', { name: 'Show History' });
    expect(historyBtn).toBeInTheDocument();
    
    // Toggle history
    fireEvent.click(historyBtn);
    expect(screen.getByTestId('mock-scan-history')).toBeInTheDocument();
    expect(historyBtn).toHaveTextContent('Hide History');
    
    // Logout as admin should hide history
    fireEvent.click(screen.getByText('Mock Admin Logout'));
    expect(screen.queryByTestId('mock-scan-history')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show History' })).not.toBeInTheDocument();
  });
});
