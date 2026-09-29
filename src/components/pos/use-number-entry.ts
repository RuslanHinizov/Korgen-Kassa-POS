"use client";

import { useRef, useState } from "react";

/**
 * The typing logic of UMAG's number fields: the value starts selected (the first key replaces it), «.» is allowed once,
 * delete removes the last character. The value lives in a ref as well as in state, so keys that arrive faster than React
 * re-renders (a fast double tap, a key held down) are never lost.
 */
export function useNumberEntry(initial: string, allowDecimal: boolean, maxDigits: number) {
  const [entry, setEntry] = useState({ text: initial, selected: true });
  const ref = useRef(entry);
  const write = (text: string, selected: boolean) => {
    const next = { text, selected };
    ref.current = next;
    setEntry(next);
  };

  function press(key: string) {
    const { text, selected } = ref.current;
    if (key === ".") {
      if (!allowDecimal) return;
      if (selected) write("0.", false);
      else if (!text.includes(".")) write(text + ".", false);
      return;
    }
    const next = (selected || text === "0" ? "" : text) + key;
    if (next.replace(".", "").length > maxDigits) return;
    write(next, false);
  }
  function remove() {
    const { text, selected } = ref.current;
    if (selected) write("0", false);
    else write(text.length > 1 ? text.slice(0, -1) : "0", false);
  }
  function set(text: string) {
    write(text, false);
  }
  return { text: entry.text, selected: entry.selected, press, remove, set, get: () => ref.current.text };
}
