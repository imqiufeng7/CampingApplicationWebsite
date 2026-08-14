"use client";

import { WheelColumn } from "@/components/public-form/WheelColumn";

const YEAR_OPTIONS = Array.from({ length: 115 - 20 + 1 }, (_, i) => {
  const v = 20 + i;
  return { value: v, label: `民國 ${v} 年` };
});
// Most registrants were born roughly ROC 80–110 — start the wheel there instead of
// at the oldest end (民國 20 年) so it doesn't take a long scroll to reach.
const YEAR_INITIAL_INDEX = YEAR_OPTIONS.findIndex((o) => o.value === 95);
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1} 月`,
}));
const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1} 日`,
}));

export function BirthDateWheelPicker({
  year,
  month,
  day,
  onYearChange,
  onMonthChange,
  onDayChange,
}: {
  year: number | undefined;
  month: number | undefined;
  day: number | undefined;
  onYearChange: (value: number) => void;
  onMonthChange: (value: number) => void;
  onDayChange: (value: number) => void;
}) {
  return (
    <div className="bg-muted/20 grid grid-cols-3 gap-2 rounded-lg border p-2">
      <WheelColumn
        options={YEAR_OPTIONS}
        value={year}
        onChange={onYearChange}
        ariaLabel="出生年（民國）"
        initialIndex={YEAR_INITIAL_INDEX}
      />
      <WheelColumn options={MONTH_OPTIONS} value={month} onChange={onMonthChange} ariaLabel="出生月" />
      <WheelColumn options={DAY_OPTIONS} value={day} onChange={onDayChange} ariaLabel="出生日" />
    </div>
  );
}
