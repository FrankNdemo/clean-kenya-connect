import { useEffect, useMemo, useState } from 'react';

interface DateRangeFilterProps {
  viewMode: 'weekly' | 'monthly';
  onDateRangeChange: (from: Date, to: Date) => void;
}

const MONTH_OPTIONS = [
  { value: 0, label: 'January' },
  { value: 1, label: 'February' },
  { value: 2, label: 'March' },
  { value: 3, label: 'April' },
  { value: 4, label: 'May' },
  { value: 5, label: 'June' },
  { value: 6, label: 'July' },
  { value: 7, label: 'August' },
  { value: 8, label: 'September' },
  { value: 9, label: 'October' },
  { value: 10, label: 'November' },
  { value: 11, label: 'December' },
];

export function DateRangeFilter({ viewMode, onDateRangeChange }: DateRangeFilterProps) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const [selectedMonth, setSelectedMonth] = useState<number | 'annual'>(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const yearOptions = useMemo(
    () => Array.from({ length: 11 }, (_, i) => currentYear - 5 + i),
    [currentYear]
  );

  useEffect(() => {
    if (viewMode === 'weekly' && selectedMonth === 'annual') {
      setSelectedMonth(currentMonth);
    }
  }, [currentMonth, selectedMonth, viewMode]);

  useEffect(() => {
    if (viewMode === 'monthly' && selectedMonth === 'annual') {
      onDateRangeChange(
        new Date(selectedYear, 0, 1),
        new Date(selectedYear, 11, 31, 23, 59, 59)
      );
      return;
    }
    const monthValue = typeof selectedMonth === 'number' ? selectedMonth : 0;
    const monthEndDay = new Date(selectedYear, monthValue + 1, 0).getDate();

    onDateRangeChange(
      new Date(selectedYear, monthValue, 1),
      new Date(selectedYear, monthValue, monthEndDay, 23, 59, 59)
    );
  }, [onDateRangeChange, selectedMonth, selectedYear, viewMode]);

  return (
    <div className="flex flex-wrap items-end gap-3 mt-2">
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Month</label>
        <select
          className="h-9 min-w-[180px] rounded-md border border-input bg-background px-3 text-sm"
          value={String(selectedMonth)}
          onChange={(event) => {
            const value = event.target.value;
            setSelectedMonth(value === 'annual' ? 'annual' : Number(value));
          }}
        >
          {viewMode === 'monthly' && (
            <option value="annual">Annual (Jan - Dec)</option>
          )}
          {MONTH_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Year</label>
        <select
          className="h-9 min-w-[120px] rounded-md border border-input bg-background px-3 text-sm"
          value={selectedYear}
          onChange={(event) => setSelectedYear(Number(event.target.value))}
        >
          {yearOptions.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
