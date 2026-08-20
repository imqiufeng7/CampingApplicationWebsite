"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const ROC_OFFSET = 1911;
const MIN_ROC_YEAR = 20;
const MAX_ROC_YEAR = 115;
const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

const YEAR_OPTIONS = Array.from(
  { length: MAX_ROC_YEAR - MIN_ROC_YEAR + 1 },
  (_, i) => MAX_ROC_YEAR - i
);
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

function daysInMonth(gregorianYear: number, month: number): number {
  return new Date(gregorianYear, month, 0).getDate();
}

function firstWeekday(gregorianYear: number, month: number): number {
  return new Date(gregorianYear, month - 1, 1).getDay();
}

export function BirthDateCalendarPicker({
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
  const [open, setOpen] = useState(false);
  // View state defaults to the selected date if there is one, otherwise a
  // reasonable middle-of-range year so the grid isn't scrolled to either extreme.
  const [viewYear, setViewYear] = useState(year ?? 95);
  const [viewMonth, setViewMonth] = useState(month ?? 1);

  const gregorianViewYear = viewYear + ROC_OFFSET;
  const totalDays = daysInMonth(gregorianViewYear, viewMonth);
  const leadingBlanks = firstWeekday(gregorianViewYear, viewMonth);

  function handleOpenChange(next: boolean) {
    if (next) {
      setViewYear(year ?? 95);
      setViewMonth(month ?? 1);
    }
    setOpen(next);
  }

  function selectDay(d: number) {
    onYearChange(viewYear);
    onMonthChange(viewMonth);
    onDayChange(d);
    setOpen(false);
  }

  const label = year && month && day ? `民國 ${year} 年 ${month} 月 ${day} 日` : "請選擇出生日期";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button type="button" variant="outline" className="w-full justify-start font-normal" />}>
        {label}
      </DialogTrigger>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>選擇出生日期（民國）</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="flex gap-2">
            <select
              aria-label="出生年（民國）"
              className="border-input h-8 flex-1 rounded-lg border bg-transparent px-2 text-sm"
              value={viewYear}
              onChange={(e) => setViewYear(Number(e.target.value))}
            >
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  民國 {y} 年
                </option>
              ))}
            </select>
            <select
              aria-label="出生月"
              className="border-input h-8 rounded-lg border bg-transparent px-2 text-sm"
              value={viewMonth}
              onChange={(e) => setViewMonth(Number(e.target.value))}
            >
              {MONTH_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m} 月
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} className="text-muted-foreground py-1">
                {w}
              </div>
            ))}
            {Array.from({ length: leadingBlanks }, (_, i) => (
              <div key={`blank-${i}`} />
            ))}
            {Array.from({ length: totalDays }, (_, i) => i + 1).map((d) => {
              const selected = year === viewYear && month === viewMonth && day === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => selectDay(d)}
                  className={
                    selected
                      ? "bg-primary text-primary-foreground rounded-md py-1.5"
                      : "hover:bg-muted rounded-md py-1.5"
                  }
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
