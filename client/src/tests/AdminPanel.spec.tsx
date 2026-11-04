import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AdminPanel from '@/components/nfc/AdminPanel';

// Mock the Dialog components from Radix UI and NfcWriter
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open, onOpenChange }: any) => (
    <div data-testid="dialog">
      {open && children}
      <button data-testid="dialog-close-mock" onClick={() => onOpenChange(false)}>Close</button>
    </div>
  ),
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: any) => <div data-testid="dialog-title">{children}</div>,
}));

vi.mock('@/components/nfc/NfcWriter', () => ({
  default: ({ onWriteComplete }: any) => (
    <div data-testid="mock-nfc-writer">
      <button onClick={() => onWriteComplete('12345')}>Mock Write</button>
    </div>
  )
}));

let mockRole: string | null = null;
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ currentUser: mockRole ? { userId: 'X1', name: 'X', role: mockRole } : null }),
}));

describe('AdminPanel', () => {
  const mockOnWriteComplete = vi.fn();
  const mockOnAuthChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockRole = null;
  });

  const open = () => {
    render(<AdminPanel onWriteComplete={mockOnWriteComplete} onAuthChange={mockOnAuthChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Issue Tag/i }));
  };

  it('has no password field: access follows the logged-in account', () => {
    mockRole = 'DOCTOR';
    open();
    expect(screen.queryByPlaceholderText(/password/i)).not.toBeInTheDocument();
  });

  it('mounts NfcWriter for a DOCTOR session and reports issuer access', () => {
    mockRole = 'DOCTOR';
    open();
    expect(screen.getByTestId('mock-nfc-writer')).toBeInTheDocument();
    expect(mockOnAuthChange).toHaveBeenCalledWith(true);
  });

  it.each([['FIRST_RESPONDER'], ['USER'], [null]])('refuses the writer for role %s', (role) => {
    mockRole = role;
    open();
    expect(screen.queryByTestId('mock-nfc-writer')).not.toBeInTheDocument();
    expect(screen.getByTestId('dialog-title')).toHaveTextContent('Clinician Access Required');
    expect(mockOnAuthChange).toHaveBeenCalledWith(false);
  });

  it('handles write success callback from NfcWriter and closes the dialog', () => {
    mockRole = 'DOCTOR';
    open();
    fireEvent.click(screen.getByText('Mock Write'));

    expect(mockOnWriteComplete).toHaveBeenCalledWith('12345');
    expect(screen.queryByTestId('mock-nfc-writer')).not.toBeInTheDocument();
  });
});
