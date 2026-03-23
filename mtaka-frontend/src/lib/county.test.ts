import { describe, expect, it } from 'vitest';

import { getCountyFromLocation, locationMatchesCounty } from './county';

describe('county resolver', () => {
  it('maps common areas to their county', () => {
    expect(getCountyFromLocation('Kisiani')).toBe('Kisumu');
    expect(getCountyFromLocation('Maseno, Kisumu County')).toBe('Kisumu');
    expect(getCountyFromLocation('Kisumu East')).toBe('Kisumu');
    expect(getCountyFromLocation('Karen')).toBe('Nairobi');
    expect(getCountyFromLocation('Mombasa Road')).toBe('');
  });

  it('matches collectors by county even when the service area is a sub-location', () => {
    expect(locationMatchesCounty('Kisumu, Maseno, Chulaimbo', 'Kisumu')).toBe(true);
    expect(locationMatchesCounty('Karen, Westlands, Nairobi', 'Nairobi')).toBe(true);
    expect(locationMatchesCounty('Karen, Westlands, Nairobi', 'Kisumu')).toBe(false);
  });
});
