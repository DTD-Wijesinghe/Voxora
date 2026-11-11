import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { JoinSessionPage } from './JoinSessionPage';

describe('JoinSessionPage', () => {
  it('prevents an empty display name from being submitted', async () => {
    render(<JoinSessionPage onBack={vi.fn()} onJoined={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /join session/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/display name/i);
  });

  it('submits valid details and navigates to the conversation', async () => {
    const onJoined = vi.fn();
    render(<JoinSessionPage onBack={vi.fn()} onJoined={onJoined} />);
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Amaya' } });
    fireEvent.change(screen.getByLabelText(/preferred language/i), { target: { value: 'si' } });
    fireEvent.change(screen.getByLabelText(/session code/i), { target: { value: '6E175D' } });
    fireEvent.click(screen.getByRole('button', { name: /join session/i }));
    await waitFor(() => expect(onJoined).toHaveBeenCalledOnce());
  });
});

