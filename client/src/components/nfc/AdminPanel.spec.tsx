import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AdminPanel from './AdminPanel';

// Mock the Dialog components from Radix UI and NfcWriter
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open, onOpenChange }: any) => (
    <div data-testid="dialog">
      {open ? children : null}
    </div>
  ),
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: any) => <div data-testid="dialog-title">{children}</div>,
}));

vi.mock('./NfcWriter', () => ({
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
});
