import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import ScanHistory from './ScanHistory';

describe('ScanHistory', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders nothing when not visible', () => {
    const { container } = render(<ScanHistory visible={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders empty state when history is empty', () => {
    render(<ScanHistory visible={true} />);
    expect(screen.getByText('Scan History')).toBeInTheDocument();
    expect(screen.getByText('No scan history available')).toBeInTheDocument();
  });

  it('renders stored history correctly', () => {
    const mockHistory = [
      { accountId: '12345', timestamp: 1672531200000 },
      { accountId: '67890', timestamp: 1672617600000 }
    ];
    localStorage.setItem('scanHistory', JSON.stringify(mockHistory));

    render(<ScanHistory visible={true} />);
    
    expect(screen.getByText('12345')).toBeInTheDocument();
    expect(screen.getByText('67890')).toBeInTheDocument();
  });

  it('clears history when clear button is clicked', () => {
    const mockHistory = [{ accountId: '12345', timestamp: 1672531200000 }];
    localStorage.setItem('scanHistory', JSON.stringify(mockHistory));

    render(<ScanHistory visible={true} />);
    expect(screen.getByText('12345')).toBeInTheDocument();
    
    fireEvent.click(screen.getByRole('button', { name: 'Clear History' }));
    
    expect(screen.queryByText('12345')).not.toBeInTheDocument();
    expect(screen.getByText('No scan history available')).toBeInTheDocument();
    expect(localStorage.getItem('scanHistory')).toBeNull();
  });
});
