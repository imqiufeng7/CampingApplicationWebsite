"use client";

import { useEffect, useRef } from "react";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { markTourSeen, type TourPage } from "@/app/admin/(protected)/tour-actions";

export function OnboardingTour({
  page,
  alreadySeen,
  steps,
}: {
  page: TourPage;
  alreadySeen: boolean;
  steps: DriveStep[];
}) {
  // Guards against React 18/19 dev StrictMode double-invoking the effect, which
  // would otherwise briefly flash two overlapping driver.js instances.
  const startedRef = useRef(false);

  useEffect(() => {
    if (alreadySeen || startedRef.current) return;
    startedRef.current = true;

    // Small delay so the page's own data has painted before driver.js measures
    // element positions for the spotlight cutout.
    const timer = setTimeout(() => {
      const tourDriver = driver({
        steps,
        showProgress: true,
        progressText: "第 {{current}} / {{total}} 步",
        overlayColor: "#4b5563",
        overlayOpacity: 0.75,
        stagePadding: 6,
        stageRadius: 8,
        allowClose: true,
        skipMissingElement: true,
        nextBtnText: "下一步",
        prevBtnText: "上一步",
        doneBtnText: "完成",
        onDestroyed: () => {
          void markTourSeen(page);
        },
      });
      tourDriver.drive();
    }, 300);

    return () => clearTimeout(timer);
  }, [alreadySeen, page, steps]);

  return null;
}
