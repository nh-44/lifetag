import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import NfcScanner from './NfcScanner';
import { NfcCryptoService } from '@/services/nfcCryptoService';

describe('NfcScanner', () => {
  const mockOnScanComplete = vi.fn();
  const mockOnScanError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('runs simulation mode when NDEFReader is undefined', async () => {
    vi.stubGlobal('NDEFReader', undefined);

    render(
      <NfcScanner 
        isScanning={true} 
        onScanComplete={mockOnScanComplete} 
        onScanError={mockOnScanError} 
      />
    );
    
    await waitFor(() => {
      expect(screen.getByText(/NFC is not supported/i)).toBeInTheDocument();
    });
    
    await waitFor(() => {
      expect(mockOnScanComplete).toHaveBeenCalled();
    }, { timeout: 3000 });
  });

  it('valid certified payload triggers onScanComplete with trustedAuthority true', async () => {
    let readingCallback: any = null;
    const mockScan = vi.fn().mockResolvedValue(undefined);
    const mockAddEventListener = vi.fn((event, cb) => {
      if (event === 'reading') readingCallback = cb;
    });
    
    class MockNDEFReader {
      scan = mockScan;
      addEventListener = mockAddEventListener;
    }
    vi.stubGlobal('NDEFReader', MockNDEFReader);

    vi.spyOn(NfcCryptoService, 'verifyTagIntegrity').mockResolvedValue({
      verified: true,
      trustedAuthority: true
    });

    render(
      <NfcScanner 
        isScanning={true} 
        onScanComplete={mockOnScanComplete} 
        onScanError={mockOnScanError} 
      />
    );
    
    await waitFor(() => {
      expect(mockAddEventListener).toHaveBeenCalledWith('reading', expect.any(Function));
    });

    const mockPayload = { fhirPatientId: "54321" };
    const encoder = new TextEncoder();
    
    await act(async () => {
      await readingCallback({
        message: {
          records: [
            {
              recordType: 'text',
              data: encoder.encode(JSON.stringify(mockPayload)).buffer
            }
          ]
        }
      });
    });

    await waitFor(() => {
      expect(mockOnScanComplete).toHaveBeenCalledWith("54321", expect.objectContaining({ fhirPatientId: "54321" }));
    });
  });

  it('tampered payload fails verification and rejects scan', async () => {
    let readingCallback: any = null;
    const mockScan = vi.fn().mockResolvedValue(undefined);
    const mockAddEventListener = vi.fn((event, cb) => {
      if (event === 'reading') readingCallback = cb;
    });
    
    class MockNDEFReader {
      scan = mockScan;
      addEventListener = mockAddEventListener;
    }
    vi.stubGlobal('NDEFReader', MockNDEFReader);

    vi.spyOn(NfcCryptoService, 'verifyTagIntegrity').mockResolvedValue({
      verified: false,
      trustedAuthority: false,
      error: "Signature tampered"
    });

    render(
      <NfcScanner 
        isScanning={true} 
        onScanComplete={mockOnScanComplete} 
        onScanError={mockOnScanError} 
      />
    );
    
    await waitFor(() => {
      expect(mockAddEventListener).toHaveBeenCalledWith('reading', expect.any(Function));
    });

    const mockPayload = { fhirPatientId: "54321" };
    const encoder = new TextEncoder();
    
    await act(async () => {
      await readingCallback({
        message: {
          records: [
            {
              recordType: 'text',
              data: encoder.encode(JSON.stringify(mockPayload)).buffer
            }
          ]
        }
      });
    });

    await waitFor(() => {
      expect(mockOnScanError).toHaveBeenCalledWith(expect.stringContaining("Signature tampered"));
      expect(mockOnScanComplete).not.toHaveBeenCalled();
    });
  });

  it('handles invalid JSON payload', async () => {
    let readingCallback: any = null;
    const mockScan = vi.fn().mockResolvedValue(undefined);
    const mockAddEventListener = vi.fn((event, cb) => {
      if (event === 'reading') readingCallback = cb;
    });
    
    class MockNDEFReader {
      scan = mockScan;
      addEventListener = mockAddEventListener;
    }
    vi.stubGlobal('NDEFReader', MockNDEFReader);

    render(
      <NfcScanner 
        isScanning={true} 
        onScanComplete={mockOnScanComplete} 
        onScanError={mockOnScanError} 
      />
    );
    
    await waitFor(() => {
      expect(mockAddEventListener).toHaveBeenCalledWith('reading', expect.any(Function));
    });

    const encoder = new TextEncoder();
    
    await act(async () => {
      await readingCallback({
        message: {
          records: [
            {
              recordType: 'text',
              data: encoder.encode("not valid json format at all").buffer
            }
          ]
        }
      });
    });

    await waitFor(() => {
      expect(mockOnScanError).toHaveBeenCalledWith(expect.stringContaining("No JSON found"));
    });
  });
});
