import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import NfcWriter from '@/components/nfc/NfcWriter';
import { NfcCryptoService } from '@/services/nfcCryptoService';
import { fetchWithAuth } from '@/services/api';

vi.mock('@/services/api', () => ({
  fetchWithAuth: vi.fn(),
  logBenchmarkTelemetry: vi.fn().mockResolvedValue({ success: true })
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

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default success mock for fetchWithAuth
    vi.mocked(fetchWithAuth).mockResolvedValue({
      success: true,
      data: {
        accountId: '12345',
        name: "Jane Doe",
        bloodGroup: "O-Negative",
        allergies: ["None"],
        emergencyContacts: [],
        dnrStatus: false,
        authoritySignature: "mock-sig"
      }
    });
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
    
    // Fill out form fields manually
    fireEvent.change(screen.getByLabelText(/FHIR Patient ID/i), { target: { value: '12345' } });
    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Jane Doe' } });
    
    const writeBtn = screen.getByRole('button', { name: /Write Compressed Payload/i });
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

    render(
      <NfcWriter 
        onWriteComplete={mockOnWriteComplete} 
        onWriteError={mockOnWriteError} 
      />
    );
    
    // Fill out form fields
    fireEvent.change(screen.getByLabelText(/FHIR Patient ID/i), { target: { value: '54321' } });
    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'John Smith' } });
    
    const writeBtn = screen.getByRole('button', { name: /Write Compressed Payload/i });
    fireEvent.click(writeBtn);

    await waitFor(() => {
      expect(mockWrite).toHaveBeenCalled();
      expect(mockOnWriteComplete).toHaveBeenCalledWith('54321');
    });
  });

  it('fails size validation and prevents hardware write when compressed payload > 504 bytes', async () => {
    const mockWrite = vi.fn().mockResolvedValue(undefined);
    class MockNDEFReader { write = mockWrite; }
    vi.stubGlobal('NDEFReader', MockNDEFReader);

    // Mock compressPayload to return a large payload
    vi.spyOn(NfcCryptoService, 'compressPayload').mockResolvedValue(new Uint8Array(600));

    render(
      <NfcWriter 
        onWriteComplete={mockOnWriteComplete} 
        onWriteError={mockOnWriteError} 
      />
    );
    
    fireEvent.change(screen.getByLabelText(/FHIR Patient ID/i), { target: { value: '99999' } });
    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Jane Doe' } });
    
    const writeBtn = screen.getByRole('button', { name: /Write Compressed Payload/i });
    fireEvent.click(writeBtn);

    await waitFor(() => {
      expect(mockOnWriteError).toHaveBeenCalledWith(expect.stringContaining('exceeds standard NTAG215 budget'));
      expect(mockWrite).not.toHaveBeenCalled();
    });
  });

  it('shows write button as disabled for invalid inputs', () => {
    render(<NfcWriter onWriteComplete={mockOnWriteComplete} onWriteError={mockOnWriteError} />);
    
    const btn = screen.getByRole('button', { name: /Write Compressed Payload/i });
    expect(btn).toBeDisabled();
    
    // Input invalid ID
    fireEvent.change(screen.getByLabelText(/FHIR Patient ID/i), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Jane' } });
    expect(btn).toBeDisabled();
  });

  it('handles backend API failure during fetch profile', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValueOnce({
      success: false,
      error: { message: "Patient not found" }
    });
    
    render(<NfcWriter onWriteComplete={mockOnWriteComplete} onWriteError={mockOnWriteError} />);
    
    // Fill fetch input
    fireEvent.change(screen.getByLabelText(/Auto-Fill from Account ID/i), { target: { value: '12345' } });
    
    const fetchBtn = screen.getByRole('button', { name: /Fetch Profile/i });
    fireEvent.click(fetchBtn);

    // Should fetch and handle failure gracefully (shows error toast)
    await waitFor(() => {
      expect(fetchWithAuth).toHaveBeenCalledWith('/patients/triage/12345');
    });
  });

  it('handles NFC permission denied or write failure', async () => {
    const mockWrite = vi.fn().mockRejectedValue({ name: 'NotAllowedError', message: 'Permission Denied' });
    class MockNDEFReader { write = mockWrite; }
    vi.stubGlobal('NDEFReader', MockNDEFReader);

    render(<NfcWriter onWriteComplete={mockOnWriteComplete} onWriteError={mockOnWriteError} />);
    
    fireEvent.change(screen.getByLabelText(/FHIR Patient ID/i), { target: { value: '12345' } });
    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Jane Doe' } });
    
    const writeBtn = screen.getByRole('button', { name: /Write Compressed Payload/i });
    fireEvent.click(writeBtn);

    await waitFor(() => {
      expect(mockOnWriteError).toHaveBeenCalledWith('NFC permission denied. Please allow NFC access.');
    });
  });
});
