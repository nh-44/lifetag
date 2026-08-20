import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import NfcWriter from './NfcWriter';
import { NfcCryptoService } from '@/services/nfcCryptoService';
import { fetchWithAuth, logBenchmarkTelemetry } from '@/services/api';
import { toast } from 'sonner';

vi.mock('@/services/api', () => ({
  fetchWithAuth: vi.fn(),
  logBenchmarkTelemetry: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn()
  }
}));

describe('NfcWriter', () => {
  const mockOnWriteComplete = vi.fn();
  const mockOnWriteError = vi.fn();

  const fetchProfile = async (accountId: string) => {
    fireEvent.change(screen.getByPlaceholderText(/Enter 5-digit account ID/i), { target: { value: accountId } });
    fireEvent.click(screen.getByRole('button', { name: /Fetch Profile/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/FHIR Patient ID/i)).toHaveValue(accountId);
      expect(screen.getByLabelText(/Full Name/i)).toHaveValue("Jane Doe");
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(logBenchmarkTelemetry).mockResolvedValue(undefined);
    
    // Default success mock for fetchWithAuth
    vi.mocked(fetchWithAuth).mockResolvedValue({
      success: true,
      data: {
        accountId: '12345',
        name: "Jane Doe",
        bloodGroup: "O-",
        allergies: ["None"],
        emergencyContacts: [],
        dnrStatus: false,
      }
    });
    
    // Ensure crypto methods run synchronously in tests if not mocked, 
    // but they are async now so we just let them execute normally or mock them.
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('runs simulation mode when NDEFReader is undefined', async () => {
    vi.stubGlobal('NDEFReader', undefined);

    render(
      <NfcWriter 
        onWriteComplete={mockOnWriteComplete} 
        onWriteError={mockOnWriteError} 
      />
    );
    
    await waitFor(() => {
      expect(screen.getByText(/NFC is not supported/i)).toBeInTheDocument();
    });
    
    await fetchProfile('12345');
    
    const writeBtn = screen.getByRole('button', { name: /^Write/i });
    fireEvent.click(writeBtn);

    await waitFor(() => {
      expect(mockOnWriteComplete).toHaveBeenCalledWith('12345');
    }, { timeout: 3000 });
  });

  it('successfully writes when NDEFReader is supported', async () => {
    const mockWrite = vi.fn().mockResolvedValue(undefined);
    
    class MockNDEFReader {
      write = mockWrite;
    }
    vi.stubGlobal('NDEFReader', MockNDEFReader);

    vi.mocked(fetchWithAuth).mockResolvedValueOnce({
      success: true,
      data: {
        accountId: '54321',
        name: "Jane Doe",
        bloodGroup: "O-",
        allergies: ["None"],
        emergencyContacts: [],
        dnrStatus: false,
      }
    });

    render(
      <NfcWriter 
        onWriteComplete={mockOnWriteComplete} 
        onWriteError={mockOnWriteError} 
      />
    );
    
    await fetchProfile('54321');
    
    const writeBtn = screen.getByRole('button', { name: /^Write/i });
    fireEvent.click(writeBtn);

    await waitFor(() => {
      expect(mockWrite).toHaveBeenCalled();
      expect(mockOnWriteComplete).toHaveBeenCalledWith('54321');
    });
  });

  it('fails size validation and prevents hardware write when rawBytes > 504', async () => {
    const mockWrite = vi.fn().mockResolvedValue(undefined);
    class MockNDEFReader { write = mockWrite; }
    vi.stubGlobal('NDEFReader', MockNDEFReader);

    vi.spyOn(NfcCryptoService, 'compressPayload').mockResolvedValue(new Uint8Array(600));

    render(
      <NfcWriter 
        onWriteComplete={mockOnWriteComplete} 
        onWriteError={mockOnWriteError} 
      />
    );
    
    vi.mocked(fetchWithAuth).mockResolvedValueOnce({
      success: true,
      data: {
        accountId: '99999',
        name: "Jane Doe",
        bloodGroup: "O-",
        allergies: ["None"],
        emergencyContacts: [],
        dnrStatus: false,
      }
    });
    await fetchProfile('99999');
    
    const writeBtn = screen.getByRole('button', { name: /^Write/i });
    fireEvent.click(writeBtn);

    await waitFor(() => {
      expect(mockOnWriteError).toHaveBeenCalledWith(expect.stringContaining('exceeds standard NTAG215 budget'));
      expect(mockWrite).not.toHaveBeenCalled();
    });
  });

  it('shows error for invalid account ID', () => {
    render(<NfcWriter onWriteComplete={mockOnWriteComplete} onWriteError={mockOnWriteError} />);
    const input = screen.getByPlaceholderText(/Enter 5-digit account ID/i);
    fireEvent.change(input, { target: { value: '1234' } }); // Only 4 digits
    const btn = screen.getByRole('button', { name: /^Write/i });
    expect(btn).toBeDisabled();
  });

  it('handles backend API failure', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValueOnce({
      success: false,
      error: { message: "Patient not found" }
    });
    
    render(<NfcWriter onWriteComplete={mockOnWriteComplete} onWriteError={mockOnWriteError} />);
    fireEvent.change(screen.getByPlaceholderText(/Enter 5-digit account ID/i), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: /Fetch Profile/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Patient not found');
    });
  });

  it('handles NFC permission denied or write failure', async () => {
    const mockWrite = vi.fn().mockRejectedValue(new Error("NFC Permission Denied"));
    class MockNDEFReader { write = mockWrite; }
    vi.stubGlobal('NDEFReader', MockNDEFReader);

    render(<NfcWriter onWriteComplete={mockOnWriteComplete} onWriteError={mockOnWriteError} />);
    await fetchProfile('12345');
    fireEvent.click(screen.getByRole('button', { name: /^Write/i }));

    await waitFor(() => {
      expect(mockOnWriteError).toHaveBeenCalledWith('NFC Permission Denied');
    });
  });
});
