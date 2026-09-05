"use client";

import { ArrowDownLeft, ArrowUpRight, ShieldCheck } from "lucide-react";
import { normalizeText, statusAppearance } from "@/lib/revisiones-display";

export function StatusBadge({ value }: { value: string }) {
  const { tone, label } = statusAppearance(value);
  const Icon =
    normalizeText(value) === "check in"
      ? ArrowDownLeft
      : normalizeText(value) === "check out"
        ? ArrowUpRight
        : ShieldCheck;
  return (
    <span className={`status-badge tone-${tone}`}>
      <Icon size={13} aria-hidden="true" />
      {label}
    </span>
  );
}
