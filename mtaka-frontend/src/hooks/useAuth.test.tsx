import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loginUser } from '@/api';
import { AuthProvider, useAuth } from './useAuth';

const { mockApiLogout, mockGetProfile, mockLoginUser } = vi.hoisted(() => ({
  mockApiLogout: vi.fn(),
  mockGetProfile: vi.fn(),
  mockLoginUser: vi.fn(),
}));

vi.mock('@/api', () => ({
  __esModule: true,
  default: {
    get: vi.fn(),
  },
  loginUser: mockLoginUser,
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
      <span data-testid="user-superuser">{String(Boolean(user?.isSuperuser))}</span>
    </div>
  );
}

function LoginErrorProbe() {
  const { login } = useAuth();
  const [message, setMessage] = useState('');

  return (
    <div>
      <button
        type="button"
        onClick={async () => {
          try {
            await login('resident@example.com', 'wrong-password');
          } catch (error) {
            setMessage(error instanceof Error ? error.message : 'unknown');
          }
        }}
      >
        Trigger Login
      </button>
      <span data-testid="login-error">{message}</span>
    </div>
  );
}

describe('AuthProvider', () => {
  const mockedLoginUser = vi.mocked(loginUser);

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
        is_superuser: true,
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
      expect(screen.getByTestId('user-superuser')).toHaveTextContent('true');
    });

    expect(mockGetProfile).toHaveBeenCalledTimes(1);
    expect(mockApiLogout).not.toHaveBeenCalled();
  });

  it('maps invalid credentials to a friendlier login message', async () => {
    window.sessionStorage.setItem('mtaka_tab_auth_session', '1');
    mockGetProfile.mockRejectedValue({ response: { status: 401 } });
    mockedLoginUser.mockRejectedValue({
      response: {
        status: 401,
        data: {
          error: 'Invalid credentials',
        },
      },
    });

    render(
      <AuthProvider>
        <AuthProbe />
        <LoginErrorProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Trigger Login' }));

    await waitFor(() => {
      expect(screen.getByTestId('login-error')).toHaveTextContent(
        'Invalid input. Check your email or password and try again.'
      );
    });
  });
});
