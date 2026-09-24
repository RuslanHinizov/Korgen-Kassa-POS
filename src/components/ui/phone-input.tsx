"use client";

import { formatPhoneInput } from "@/lib/phone";

/** Phone field that always starts with +7 and formats as +7 (776) 422-33-44 while typing. */
export function PhoneInput({ value, onChange, className, id, required, autoComplete = "tel" }: {
  value: string; onChange: (formatted: string) => void; className?: string; id?: string; required?: boolean; autoComplete?: string;
}) {
  return (
    <input
      id={id}
      type="tel"
      inputMode="tel"
      required={required}
      autoComplete={autoComplete}
      className={className}
      placeholder="+7 (___) ___-__-__"
      value={value}
      onFocus={() => { if (!value) onChange("+7"); }}
      onBlur={() => { if (value === "+7") onChange(""); }}
      onChange={(e) => onChange(e.target.value ? formatPhoneInput(e.target.value) : "")}
    />
  );
}
