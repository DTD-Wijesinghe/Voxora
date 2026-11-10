import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomePage } from './HomePage';

describe('HomePage', () => {
  it('renders the main heading and starts a session', () => {
    const onJoin = vi.fn();
    render(<HomePage onJoin={onJoin} />);
    expect(screen.getByRole('heading', { name: /conversations that/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /start a conversation/i }));
    expect(onJoin).toHaveBeenCalledOnce();
  });
});

