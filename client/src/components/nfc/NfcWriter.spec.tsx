import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import NfcWriter from './NfcWriter';
import { NfcCryptoService } from '@/services/nfcCryptoService';
import { fetchWithAuth } from '@/services/api';

vi.mock('@/services/api', () => ({
  fetchWithAuth: vi.fn()
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
    
    const input = screen.getByPlaceholderText(/Enter 5-digit account ID/i);
    fireEvent.change(input, { target: { value: '12345' } });
    
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

    render(
      <NfcWriter 
        onWriteComplete={mockOnWriteComplete} 
        onWriteError={mockOnWriteError} 
      />
    );
    
    const input = screen.getByPlaceholderText(/Enter 5-digit account ID/i);
    fireEvent.change(input, { target: { value: '54321' } });
    
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

    // Mock calculateByteSize to return rawBytes > 504
    vi.spyOn(NfcCryptoService, 'calculateByteSize').mockResolvedValue({ rawBytes: 600, compressedBytes: 300, fitsNtag215: true });

    render(
      <NfcWriter 
        onWriteComplete={mockOnWriteComplete} 
        onWriteError={mockOnWriteError} 
      />
    );
    
    const input = screen.getByPlaceholderText(/Enter 5-digit account ID/i);
    fireEvent.change(input, { target: { value: '99999' } });
    
    const writeBtn = screen.getByRole('button', { name: /^Write/i });
    fireEvent.click(writeBtn);

    await waitFor(() => {
      expect(mockOnWriteError).toHaveBeenCalledWith(expect.stringContaining('Payload too large'));
      expect(mockWrite).not.toHaveBeenCalled();
    });
  });
});
