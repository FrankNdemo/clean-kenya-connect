import { describe, expect, it } from 'vitest';
import { getDashboardPathForUser } from './dashboardPaths';

describe('getDashboardPathForUser', () => {
  it('routes superusers to the dedicated dashboard', () => {
    expect(getDashboardPathForUser({ role: 'authority', isSuperuser: true })).toBe('/dashboard/superuser');
  });

  it('routes authority accounts to the authority dashboard', () => {
    expect(getDashboardPathForUser({ role: 'authority' })).toBe('/dashboard/authority');
  });

  it('routes residents to the resident dashboard', () => {
    expect(getDashboardPathForUser({ role: 'resident' })).toBe('/dashboard/resident');
  });
});
