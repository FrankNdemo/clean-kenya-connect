import { describe, expect, it, vi } from 'vitest';

const { mockGetApiOrigin } = vi.hoisted(() => ({
  mockGetApiOrigin: vi.fn(() => 'https://mtaka-backend.onrender.com'),
}));

vi.mock('@/api', () => ({
  getApiOrigin: mockGetApiOrigin,
  createDumpingReportApi: vi.fn(),
  deleteDumpingReportApi: vi.fn(),
  listDumpingReportsApi: vi.fn(),
  updateDumpingReportApi: vi.fn(),
}));

import { resolveDumpingReportPhotoUrl } from './dumpingReportsDb';

describe('resolveDumpingReportPhotoUrl', () => {
  it('normalizes absolute media urls back to the configured backend origin', () => {
    expect(
      resolveDumpingReportPhotoUrl('http://wrong-host.onrender.com/media/dumping_reports/report.png')
    ).toBe('https://mtaka-backend.onrender.com/media/dumping_reports/report.png');
  });

  it('adds the missing media prefix for dumping report file paths', () => {
    expect(
      resolveDumpingReportPhotoUrl('https://wrong-host.onrender.com/dumping_reports/report.png')
    ).toBe('https://mtaka-backend.onrender.com/media/dumping_reports/report.png');
  });
});
