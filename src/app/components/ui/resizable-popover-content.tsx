"use client";

import * as React from "react";

import { cn } from "./utils";
import { PopoverContent } from "./popover";

const STORAGE_KEY = "productPickerSize";
const DEFAULT_SIZE = { w: 640, h: 520 };
const MIN_SIZE = { w: 380, h: 280 };
const VIEWPORT_MARGIN = 16;

type Size = { w: number; h: number };

// Максимум = доступное место (его Radix кладёт в CSS-переменные контента) и
// не больше 95vw / 85vh; минимум не опускается ниже MIN_SIZE.
function clampSize(size: Size, available?: { w: number; h: number }): Size {
  const maxW = Math.max(
    MIN_SIZE.w,
    Math.min(window.innerWidth * 0.95, (available?.w ?? Infinity) - VIEWPORT_MARGIN),
  );
  const maxH = Math.max(
    MIN_SIZE.h,
    Math.min(window.innerHeight * 0.85, (available?.h ?? Infinity) - VIEWPORT_MARGIN),
  );
  return {
    w: Math.round(Math.min(Math.max(size.w, MIN_SIZE.w), maxW)),
    h: Math.round(Math.min(Math.max(size.h, MIN_SIZE.h), maxH)),
  };
}

function readStoredSize(): Size {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { w?: unknown; h?: unknown };
      if (
        typeof parsed.w === "number" && Number.isFinite(parsed.w) &&
        typeof parsed.h === "number" && Number.isFinite(parsed.h)
      ) {
        return clampSize({ w: parsed.w, h: parsed.h });
      }
    }
  } catch {
    // хранилище недоступно или данные битые — берём размер по умолчанию
  }
  return clampSize(DEFAULT_SIZE);
}

function writeStoredSize(size: Size) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(size));
  } catch {
    // не критично
  }
}

function readAvailable(element: HTMLElement | null) {
  if (!element) return undefined;
  const style = getComputedStyle(element);
  const w = parseFloat(style.getPropertyValue("--radix-popover-content-available-width"));
  const h = parseFloat(style.getPropertyValue("--radix-popover-content-available-height"));
  return {
    w: Number.isFinite(w) ? w : Infinity,
    h: Number.isFinite(h) ? h : Infinity,
  };
}

// PopoverContent, размер которого тянется мышкой за угол и края. Размер
// (px) живёт здесь, в маленьком компоненте, а children приходят готовым
// элементом — поэтому во время перетаскивания перерисовывается только он,
// а не вся страница. Контент — flex-колонка: шапка и подвал фиксированы,
// список между ними должен быть `flex-1 min-h-0 overflow-y-auto`.
// Размер общий для всех попапов (localStorage), читается при открытии;
// двойной клик по угловой ручке сбрасывает его.
export function ResizablePopoverContent({
  className,
  style,
  children,
  ...props
}: React.ComponentProps<typeof PopoverContent>) {
  const [size, setSize] = React.useState<Size>(readStoredSize);
  const sizeRef = React.useRef(size);
  sizeRef.current = size;
  // PopoverContent не пробрасывает ref, поэтому сам контент (с CSS-переменными
  // Radix) находим от ручки через data-slot.
  const handleRef = React.useRef<HTMLDivElement | null>(null);
  const getContent = () =>
    handleRef.current?.closest<HTMLElement>('[data-slot="popover-content"]') ?? null;
  const dragRef = React.useRef<{
    startX: number;
    startY: number;
    startSize: Size;
    available?: { w: number; h: number };
    resizeW: boolean;
    resizeH: boolean;
    frame: number | null;
    pending: Size | null;
  } | null>(null);
  const previousBodySelect = React.useRef<string>("");

  // Окно уменьшили — размер не должен вылезать за экран.
  React.useEffect(() => {
    const onResize = () =>
      setSize((current) => clampSize(current, readAvailable(getContent())));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const startDrag = (resizeW: boolean, resizeH: boolean) => (event: React.PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    previousBodySelect.current = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startSize: sizeRef.current,
      available: readAvailable(getContent()),
      resizeW,
      resizeH,
      frame: null,
      pending: null,
    };
  };

  const onMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const next = clampSize(
      {
        w: drag.resizeW ? drag.startSize.w + (event.clientX - drag.startX) : drag.startSize.w,
        h: drag.resizeH ? drag.startSize.h + (event.clientY - drag.startY) : drag.startSize.h,
      },
      drag.available,
    );
    drag.pending = next;
    if (drag.frame == null) {
      drag.frame = requestAnimationFrame(() => {
        drag.frame = null;
        if (drag.pending) setSize(drag.pending);
      });
    }
  };

  const endDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    event.stopPropagation();
    if (drag.frame != null) cancelAnimationFrame(drag.frame);
    dragRef.current = null;
    document.body.style.userSelect = previousBodySelect.current;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const finalSize = drag.pending ?? sizeRef.current;
    setSize(finalSize);
    writeStoredSize(finalSize);
  };

  const resetSize = () => {
    const next = clampSize(DEFAULT_SIZE, readAvailable(getContent()));
    setSize(next);
    writeStoredSize(next);
  };

  const handleProps = (resizeW: boolean, resizeH: boolean) => ({
    onPointerDown: startDrag(resizeW, resizeH),
    onPointerMove: onMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  });

  return (
    <PopoverContent
      {...props}
      className={cn("relative flex flex-col overflow-hidden", className)}
      style={{
        ...style,
        width: size.w,
        height: size.h,
        maxWidth: "min(95vw, calc(var(--radix-popover-content-available-width) - 16px))",
        maxHeight: "min(85vh, calc(var(--radix-popover-content-available-height) - 16px))",
      }}
    >
      {children}

      {/* Края: тонкие невидимые полосы */}
      <div
        aria-hidden
        {...handleProps(true, false)}
        className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize"
        style={{ touchAction: "none" }}
      />
      <div
        aria-hidden
        {...handleProps(false, true)}
        className="absolute inset-x-0 bottom-0 z-10 h-1.5 cursor-ns-resize"
        style={{ touchAction: "none" }}
      />
      {/* Угол: ручка с двумя диагональными линиями */}
      <div
        ref={handleRef}
        role="separator"
        aria-label="Изменить размер списка"
        title="Потяните, чтобы изменить размер (двойной клик — сбросить)"
        {...handleProps(true, true)}
        onDoubleClick={resetSize}
        className="absolute bottom-0 right-0 z-20 flex size-[18px] cursor-nwse-resize items-end justify-end text-muted-foreground/70 hover:text-foreground"
        style={{ touchAction: "none" }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" className="mb-0.5 mr-0.5" aria-hidden>
          <path d="M11 3 3 11M11 7 7 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </svg>
      </div>
    </PopoverContent>
  );
}
