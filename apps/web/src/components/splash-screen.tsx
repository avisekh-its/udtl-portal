"use client";

import { useEffect, useState } from "react";
import { BrandMark } from "@/components/brand-mark";

/**
 * Branded intro splash — shows once per browser session (first load), then fades
 * out to reveal the app. Skipped on subsequent navigations so it never nags.
 */
export function SplashScreen() {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("udtl_splash") === "1") return;
    sessionStorage.setItem("udtl_splash", "1");
    setShow(true);
    const t1 = setTimeout(() => setLeaving(true), 1600);
    const t2 = setTimeout(() => setShow(false), 2300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (!show) return null;

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center bg-[#1a1b1e] transition-opacity duration-700 ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* soft orange glow behind the mark */}
      <div
        aria-hidden
        className="pointer-events-none absolute h-72 w-72 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(232,93,28,0.22), transparent 70%)" }}
      />
      <div className="relative flex flex-col items-center gap-5">
        <div style={{ animation: "splash-pop .6s cubic-bezier(.2,.8,.2,1) both" }}>
          <BrandMark size="lg" />
        </div>
        <div className="h-[3px] w-40 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-[var(--color-secondary)]" style={{ animation: "splash-bar 1.5s ease-out both" }} />
        </div>
        <p
          className="text-[11px] uppercase tracking-[0.22em] text-white/40"
          style={{ animation: "splash-fade-up .6s ease-out .25s both" }}
        >
          Customer Portal &amp; Ops Console
        </p>
      </div>
    </div>
  );
}
