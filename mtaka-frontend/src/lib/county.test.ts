import { describe, expect, it } from 'vitest';

import { KENYA_COUNTIES, getCountyFromLocation, locationMatchesCounty } from './county';

describe('county resolver', () => {
  it('maps common areas to their county', () => {
    expect(getCountyFromLocation('Kisiani')).toBe('Kisumu');
    expect(getCountyFromLocation('Maseno, Kisumu County')).toBe('Kisumu');
    expect(getCountyFromLocation('Kisumu East')).toBe('Kisumu');
    expect(getCountyFromLocation('Karen')).toBe('Nairobi');
    expect(getCountyFromLocation('Nairobi City County')).toBe('Nairobi');
    expect(getCountyFromLocation('Voi, Taita Taveta')).toBe('Taita-Taveta');
    expect(getCountyFromLocation('Muranga Town')).toBe("Murang'a");
    expect(getCountyFromLocation('Mombasa Road')).toBe('');
    expect(KENYA_COUNTIES).toHaveLength(47);
  });

  it('matches collectors by county even when the service area is a sub-location', () => {
    expect(locationMatchesCounty('Kisumu, Maseno, Chulaimbo', 'Kisumu')).toBe(true);
    expect(locationMatchesCounty('Karen, Westlands, Nairobi', 'Nairobi')).toBe(true);
    expect(locationMatchesCounty('Karen, Westlands, Nairobi', 'Kisumu')).toBe(false);
    expect(locationMatchesCounty('Voi, Taita Taveta', 'Taita-Taveta')).toBe(true);
    expect(locationMatchesCounty('Mombasa Road', 'Mombasa')).toBe(false);
  });
});
