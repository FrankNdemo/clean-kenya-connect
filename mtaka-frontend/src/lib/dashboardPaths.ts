import type { User } from '@/lib/store';

export const getDashboardPathForUser = (user?: Pick<User, 'role' | 'isSuperuser'> | null) => {
  if (!user) {
    return '/login';
  }

  if (user.isSuperuser) {
    return '/dashboard/superuser';
  }

  switch (user.role) {
    case 'resident':
      return '/dashboard/resident';
    case 'collector':
      return '/dashboard/collector';
    case 'recycler':
      return '/dashboard/recycler';
    case 'authority':
      return '/dashboard/authority';
    default:
      return '/login';
  }
};
