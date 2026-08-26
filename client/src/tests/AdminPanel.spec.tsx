import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

describe('AdminPanel', () => {
  const mockOnWriteComplete = vi.fn();
  const mockOnAuthChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders initial admin button', () => {
    render(<AdminPanel onWriteComplete={mockOnWriteComplete} onAuthChange={mockOnAuthChange} />);
    expect(screen.getByRole('button', { name: /Admin/i })).toBeInTheDocument();
  });

  it('opens dialog and shows login form', () => {
    render(<AdminPanel onWriteComplete={mockOnWriteComplete} onAuthChange={mockOnAuthChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Admin/i }));
    
    expect(screen.getByTestId('dialog-title')).toHaveTextContent('Admin Login');
    expect(screen.getByPlaceholderText('Enter admin password')).toBeInTheDocument();
  });

  it('shows error on invalid password', () => {
    render(<AdminPanel onWriteComplete={mockOnWriteComplete} onAuthChange={mockOnAuthChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Admin/i }));
    
    const input = screen.getByPlaceholderText('Enter admin password');
    fireEvent.change(input, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));
    
    expect(screen.getByText('Invalid password')).toBeInTheDocument();
    expect(mockOnAuthChange).not.toHaveBeenCalled();
  });

  it('authenticates with correct password and mounts NfcWriter', () => {
    render(<AdminPanel onWriteComplete={mockOnWriteComplete} onAuthChange={mockOnAuthChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Admin/i }));
    
    const input = screen.getByPlaceholderText('Enter admin password');
    fireEvent.change(input, { target: { value: '00000' } }); // Mock password
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));
    
    expect(screen.getByTestId('mock-nfc-writer')).toBeInTheDocument();
    expect(mockOnAuthChange).toHaveBeenCalledWith(true);
  });

  it('handles write success callback from NfcWriter', () => {
    render(<AdminPanel onWriteComplete={mockOnWriteComplete} onAuthChange={mockOnAuthChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Admin/i }));
    fireEvent.change(screen.getByPlaceholderText('Enter admin password'), { target: { value: '00000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));
    
    fireEvent.click(screen.getByText('Mock Write'));
    
    expect(mockOnWriteComplete).toHaveBeenCalledWith('12345');
    // The dialog should close automatically after successful write
    expect(screen.queryByTestId('mock-nfc-writer')).not.toBeInTheDocument();
  });

  it('authenticates when pressing Enter key on password input', () => {
    render(<AdminPanel onWriteComplete={mockOnWriteComplete} onAuthChange={mockOnAuthChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Admin/i }));
    
    const input = screen.getByPlaceholderText('Enter admin password');
    fireEvent.change(input, { target: { value: '00000' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    
    expect(screen.getByTestId('mock-nfc-writer')).toBeInTheDocument();
  });

  it('handles logout and clears authentication', () => {
    render(<AdminPanel onWriteComplete={mockOnWriteComplete} onAuthChange={mockOnAuthChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Admin/i }));
    fireEvent.change(screen.getByPlaceholderText('Enter admin password'), { target: { value: '00000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));
    
    // Auth success
    expect(screen.getByTestId('mock-nfc-writer')).toBeInTheDocument();
    
    // Click Logout
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    
    // Dialog closes
    expect(screen.queryByTestId('mock-nfc-writer')).not.toBeInTheDocument();
    expect(mockOnAuthChange).toHaveBeenCalledWith(false);
  });

  it('handles dialog close without authenticating', () => {
    render(<AdminPanel onWriteComplete={mockOnWriteComplete} onAuthChange={mockOnAuthChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Admin/i }));
    
    expect(screen.getByPlaceholderText('Enter admin password')).toBeInTheDocument();
    
    // Close dialog
    fireEvent.click(screen.getByTestId('dialog-close-mock'));
    
    expect(screen.queryByPlaceholderText('Enter admin password')).not.toBeInTheDocument();
    expect(mockOnAuthChange).toHaveBeenCalledWith(false);
  });

  it('handles dialog close while authenticated', () => {
    render(<AdminPanel onWriteComplete={mockOnWriteComplete} onAuthChange={mockOnAuthChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Admin/i }));
    fireEvent.change(screen.getByPlaceholderText('Enter admin password'), { target: { value: '00000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));
    
    expect(screen.getByTestId('mock-nfc-writer')).toBeInTheDocument();
    
    // Close dialog
    fireEvent.click(screen.getByTestId('dialog-close-mock'));
    
    // Should still be authenticated for next time it opens
    expect(screen.queryByTestId('mock-nfc-writer')).not.toBeInTheDocument();
    
    // Re-open
    fireEvent.click(screen.getByRole('button', { name: /Admin Panel/i }));
    expect(screen.getByTestId('mock-nfc-writer')).toBeInTheDocument();
  });
});
