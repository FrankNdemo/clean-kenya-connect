import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '@/lib/store';
import API, {
  completePasswordReset as apiCompletePasswordReset,
  loginUser as apiLogin,
  registerUser as apiRegister,
  getProfile,
  logoutUser as apiLogout,
} from '@/api';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password?: string) => Promise<User | null>;
  logout: () => Promise<void>;
  register: (
    userData: Omit<User, 'id' | 'rewardPoints' | 'createdAt'> & {
      password: string;
      companyName?: string;
      licenseNumber?: string;
      countyOfOperation?: string;
    }
  ) => Promise<User>;
  completePasswordReset: (uid: string, token: string, password: string) => Promise<User | null>;
  switchUser: (userId: string) => Promise<void>;
  isDemoAccount: (email: string) => boolean;
}

export interface AuthError extends Error {
  payload?: {
    error?: string;
    detail?: string;
    suspended?: boolean;
    suspension_reason?: string;
    suspended_user?: {
      id: number;
      email: string;
      phone?: string;
      name?: string;
    };
  };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_CACHE_KEY = 'mtaka_auth_user_cache';
const ACCESS_TOKEN_KEY = 'mtaka_access_token';
const REFRESH_TOKEN_KEY = 'mtaka_refresh_token';
const AUTH_EXPIRED_EVENT = 'mtaka-auth-expired';
const LOGIN_FORM_CLEAR_KEY = 'mtaka_clear_login_form';
const TAB_AUTH_SESSION_KEY = 'mtaka_tab_auth_session';
const TAB_CLOSE_MARKER_KEY = 'mtaka_tab_close_marker';

const getPrimaryStorage = () => {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage;
};

const getLegacyStorage = () => {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
};

const readStoredValue = (key: string) => {
  const primary = getPrimaryStorage();
  const direct = primary?.getItem(key);
  if (direct) return direct;
  return '';
};

const storeCachedUser = (user: User | null) => {
  const primary = getPrimaryStorage();
  const legacy = getLegacyStorage();
  if (!user) {
    primary?.removeItem(AUTH_CACHE_KEY);
    legacy?.removeItem(AUTH_CACHE_KEY);
    return;
  }
  const serialized = JSON.stringify(user);
  primary?.setItem(AUTH_CACHE_KEY, serialized);
  legacy?.removeItem(AUTH_CACHE_KEY);
};

const clearAuthStorage = () => {
  const primary = getPrimaryStorage();
  const legacy = getLegacyStorage();
  primary?.removeItem(AUTH_CACHE_KEY);
  primary?.removeItem(ACCESS_TOKEN_KEY);
  primary?.removeItem(REFRESH_TOKEN_KEY);
  legacy?.removeItem(AUTH_CACHE_KEY);
  legacy?.removeItem(ACCESS_TOKEN_KEY);
  legacy?.removeItem(REFRESH_TOKEN_KEY);
};

const setActiveTabSession = () => {
  const primary = getPrimaryStorage();
  primary?.setItem(TAB_AUTH_SESSION_KEY, '1');
};

const hasActiveTabSession = () => {
  const primary = getPrimaryStorage();
  return primary?.getItem(TAB_AUTH_SESSION_KEY) === '1';
};

const clearActiveTabSession = () => {
  const primary = getPrimaryStorage();
  primary?.removeItem(TAB_AUTH_SESSION_KEY);
};

const markTabClosing = () => {
  const primary = getPrimaryStorage();
  primary?.setItem(TAB_CLOSE_MARKER_KEY, String(Date.now()));
};

const clearTabCloseMarker = () => {
  const primary = getPrimaryStorage();
  primary?.removeItem(TAB_CLOSE_MARKER_KEY);
};

const getNavigationType = () => {
  if (typeof window === 'undefined') return 'navigate';
  const navigationEntries = window.performance?.getEntriesByType?.('navigation') as
    | PerformanceNavigationTiming[]
    | undefined;
  const navigationType = navigationEntries?.[0]?.type;
  if (navigationType) return navigationType;

  const legacyNavigation = (window.performance as Performance & {
    navigation?: { type?: number };
  })?.navigation;
  if (legacyNavigation?.type === 1) return 'reload';
  if (legacyNavigation?.type === 2) return 'back_forward';
  return 'navigate';
};

const clearLegacyPersistentAuth = () => {
  const legacy = getLegacyStorage();
  legacy?.removeItem(AUTH_CACHE_KEY);
  legacy?.removeItem(ACCESS_TOKEN_KEY);
  legacy?.removeItem(REFRESH_TOKEN_KEY);
};

const mapBackendUserToFrontend = (data: any): User => {
  const fullName = `${data.user.first_name || ''} ${data.user.last_name || ''}`.trim();
  const locationFromProfile =
    data?.profile?.address ||
    data?.profile?.service_areas ||
    data?.profile?.location ||
    data?.profile?.county ||
    data?.user?.location ||
    '';

  return {
    id: data.user.id,
    name: fullName || data.user.username || '',
    email: data.user.email,
    phone: data.user.phone || '',
    role: (data.user.user_type === 'household' ? 'resident' : (data.user.user_type as any)) as any,
    location: locationFromProfile,
    rewardPoints: data.user.reward_points ?? data?.profile?.green_credits ?? 0,
    createdAt: '',
  };
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const applyAuthenticatedUser = (data: any) => {
    if (!data?.user) return null;

    const nextUser = mapBackendUserToFrontend(data);
    setUser(nextUser);
    setActiveTabSession();
    clearTabCloseMarker();
    storeCachedUser(nextUser);
    return nextUser;
  };

  useEffect(() => {
    clearLegacyPersistentAuth();

    const primaryStorage = getPrimaryStorage();
    const closeMarker = primaryStorage?.getItem(TAB_CLOSE_MARKER_KEY);
    if (closeMarker && getNavigationType() !== 'reload') {
      clearActiveTabSession();
      clearAuthStorage();
    }
    clearTabCloseMarker();

    const cached = readStoredValue(AUTH_CACHE_KEY);
    if (cached) {
      try {
        setUser(JSON.parse(cached));
      } catch {
        clearAuthStorage();
      }
    }

    const handleAuthExpired = () => {
      setUser(null);
      clearActiveTabSession();
      clearTabCloseMarker();
      clearAuthStorage();
    };

    const handleBeforeUnload = () => {
      markTabClosing();
    };

    const handlePageHide = (event: PageTransitionEvent) => {
      if (event.persisted) return;
      markTabClosing();
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);

    if (!hasActiveTabSession()) {
      setUser(null);
      clearActiveTabSession();
      clearTabCloseMarker();
      clearAuthStorage();
      setIsLoading(false);

      return () => {
        window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
        window.removeEventListener('beforeunload', handleBeforeUnload);
        window.removeEventListener('pagehide', handlePageHide);
      };
    }

    // Try to retrieve profile from backend (cookie-based auth)
    (async () => {
      try {
        const data = await getProfile();
        if (data && data.user) {
          const u = mapBackendUserToFrontend(data);
          setUser(u);
          setActiveTabSession();
          clearTabCloseMarker();
          storeCachedUser(u);
        }
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          setUser(null);
          clearActiveTabSession();
          clearTabCloseMarker();
          clearAuthStorage();
        }
      } finally {
        setIsLoading(false);
      }
    })();

    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

  const login = async (email: string, password?: string) => {
    try {
      const username = email; // backend allows username or email; using email as username
      const data = await apiLogin(username, password || '');
      return applyAuthenticatedUser(data);
    } catch (err: unknown) {
      const maybeAxiosError = err as { response?: { data?: { error?: string; detail?: string } } };
      const message =
        maybeAxiosError?.response?.data?.error ||
        maybeAxiosError?.response?.data?.detail ||
        'Login failed';
      const authError: AuthError = new Error(message);
      authError.payload = maybeAxiosError?.response?.data;
      throw authError;
    }
  };

  const logout = async () => {
    try {
      await apiLogout();
    } catch (e) {
      // ignore
    }
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(LOGIN_FORM_CLEAR_KEY, '1');
      } catch {
        // ignore
      }
    }
    setUser(null);
    clearActiveTabSession();
    clearTabCloseMarker();
    clearAuthStorage();
  };

  const register = async (
    userData: Omit<User, 'id' | 'rewardPoints' | 'createdAt'> & {
      password: string;
      companyName?: string;
      licenseNumber?: string;
      countyOfOperation?: string;
    }
  ) => {
    // Map frontend role -> backend user_type
    const mapRole = (r: string) => (r === 'resident' ? 'household' : r);
    const mappedRole = mapRole(userData.role as string);
    const payload = {
      username: userData.name || userData.email || `user_${Date.now()}`,
      email: userData.email,
      password: userData.password,
      password2: userData.password,
      user_type: mappedRole,
      phone: userData.phone,
      full_name: userData.name,
      ...(mappedRole === 'collector' || mappedRole === 'recycler'
        ? {
            company_name: userData.companyName || '',
            license_number: userData.licenseNumber || '',
          }
        : {}),
      ...(mappedRole === 'authority'
        ? {
            county_of_operation: userData.countyOfOperation || '',
          }
        : {}),
      ...(mappedRole !== 'authority'
        ? {
            location: userData.location || '',
          }
        : {}),
    } as Record<string, unknown>;

    const data = await apiRegister(payload);
    const authenticatedUser = applyAuthenticatedUser(data);
    if (authenticatedUser) {
      return authenticatedUser;
    }
    throw new Error('Registration failed');
  };

  const completePasswordReset = async (uid: string, token: string, password: string) => {
    const data = await apiCompletePasswordReset({
      uid,
      token,
      password,
      password2: password,
    });
    return applyAuthenticatedUser(data);
  };

  const switchUser = async (userId: string) => {
    try {
      const data = await getProfile();
      if (data?.user && String(data.user.id) === String(userId)) {
        const u = mapBackendUserToFrontend(data);
        setUser(u);
        setActiveTabSession();
        clearTabCloseMarker();
        storeCachedUser(u);
        return;
      }

      const res = await API.get('users/');
      const users = res.data as any[];
      const found = users.find(u => String(u.id) === String(userId));
      if (found) {
        const fullName = `${found.first_name || ''} ${found.last_name || ''}`.trim();
        const u: User = {
          id: found.id,
          name: fullName || found.username || '',
          email: found.email,
          phone: found.phone || '',
          role: (found.user_type === 'household' ? 'resident' : (found.user_type as any)) as any,
          location: found.location || '',
          rewardPoints: found.reward_points ?? 0,
          createdAt: '',
        };
        setUser(u);
        setActiveTabSession();
        clearTabCloseMarker();
        storeCachedUser(u);
      }
    } catch (e) {
      // ignore
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        register,
        completePasswordReset,
        switchUser,
        isDemoAccount: () => false,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
