import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from './useAuth';

const { mockApiLogout, mockGetProfile } = vi.hoisted(() => ({
  mockApiLogout: vi.fn(),
  mockGetProfile: vi.fn(),
}));

vi.mock('@/api', () => ({
  __esModule: true,
  default: {
    get: vi.fn(),
  },
  loginUser: vi.fn(),
  registerUser: vi.fn(),
  getProfile: mockGetProfile,
  logoutUser: mockApiLogout,
}));

function AuthProbe() {
  const { isLoading, user } = useAuth();

  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="user-email">{user?.email || ''}</span>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('does not call backend logout when booting without an active tab session', async () => {
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(mockApiLogout).not.toHaveBeenCalled();
    expect(mockGetProfile).not.toHaveBeenCalled();
  });

  it('restores the user profile when the current tab already owns the session', async () => {
    window.sessionStorage.setItem('mtaka_tab_auth_session', '1');
    mockGetProfile.mockResolvedValue({
      user: {
        id: 7,
        username: 'resident-one',
        email: 'resident@example.com',
        phone: '+254700000001',
        user_type: 'household',
        reward_points: 15,
      },
      profile: {
        address: 'Westlands, Nairobi',
        green_credits: 15,
      },
    });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-email')).toHaveTextContent('resident@example.com');
    });

    expect(mockGetProfile).toHaveBeenCalledTimes(1);
    expect(mockApiLogout).not.toHaveBeenCalled();
  });
});
