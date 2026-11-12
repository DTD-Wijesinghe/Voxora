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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'session-1', joinCode: '6E175D', status: 'live',
        participants: [{ id: 'organizer-1', displayName: 'Organizer', targetLanguage: 'si', isHost: true }],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    }));
    render(<JoinSessionPage onBack={vi.fn()} onJoined={onJoined} />);
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Amaya' } });
    fireEvent.change(screen.getByLabelText(/listening language/i), { target: { value: 'si' } });
    fireEvent.change(screen.getByLabelText(/session code/i), { target: { value: '6E175D' } });
    fireEvent.click(screen.getByRole('button', { name: /join session/i }));
    await waitFor(() => expect(onJoined).toHaveBeenCalledOnce());
  });

  it('shows an error and does not open a room for an unknown code', async () => {
    const onJoined = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ code: 'SESSION_NOT_FOUND', message: 'Session not found' }),
    }));
    render(<JoinSessionPage onBack={vi.fn()} onJoined={onJoined} />);
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Dave' } });
    fireEvent.change(screen.getByLabelText(/session code/i), { target: { value: 'QQQQ' } });
    fireEvent.click(screen.getByRole('button', { name: /join session/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not connect|session not found/i);
    expect(onJoined).not.toHaveBeenCalled();
  });
});

