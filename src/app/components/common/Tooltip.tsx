import React, { useState } from "react";
export function Tooltip({ text, children, side = "top" }: {
  text: string; children: React.ReactNode; side?: "top" | "right";
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-flex w-full"
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && text && (
        <div className={`absolute z-50 px-2.5 py-1.5 bg-slate-900 text-white text-xs rounded-md shadow-lg pointer-events-none whitespace-nowrap ${
          side === "right"
            ? "left-full top-1/2 -translate-y-1/2 ml-2"
            : "bottom-full left-1/2 -translate-x-1/2 mb-2"
        }`}>
          {text}
        </div>
      )}
    </div>
  );
}