"use client";

import { useEffect, useRef } from "react";

/**
 * Progressive enhancement: with JavaScript, changing a select or checkbox submits the surrounding GET form
 * (so the URL and results update). Without JavaScript the "Apply filters" button still works.
 * The text search is NOT auto-submitted (it submits on Enter / Apply), so typing never triggers requests.
 */
export function FilterAutoSubmit() {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = marker.current?.closest("form");
    if (!form) return;
    const onChange = (e: Event) => {
      const t = e.target;
      if (t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && t.type === "checkbox")) form.requestSubmit();
    };
    form.addEventListener("change", onChange);
    return () => form.removeEventListener("change", onChange);
  }, []);
  return <span ref={marker} hidden />;
}
