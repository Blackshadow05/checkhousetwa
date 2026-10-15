"use client";

import { useRef, type InputHTMLAttributes, type ReactNode } from "react";
import { fechaTexto } from "@/lib/fechas";

type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "children" | "className"> & {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  display?: ReactNode;
  emptyText?: string;
};

export function DateInput({ value, onValueChange, className, display, emptyText = "Elegir fecha", ...props }: DateInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <span className={`date-input${className ? ` ${className}` : ""}`} data-empty={value ? undefined : ""} data-disabled={props.disabled ? "" : undefined}>
      <span className="date-input-text" aria-hidden="true">{display ?? (value ? fechaTexto(value) : emptyText)}</span>
      <input
        {...props}
        ref={ref}
        className="date-input-native"
        type="date"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onClick={(event) => {
          props.onClick?.(event);
          if (event.defaultPrevented || window.matchMedia("(pointer: coarse)").matches) return;
          try {
            ref.current?.showPicker();
          } catch {}
        }}
      />
    </span>
  );
}
