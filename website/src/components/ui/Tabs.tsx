"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "./cx";

export interface TabItem {
  id: string;
  label: ReactNode;
  content: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  label: string;
  defaultValue?: string;
  className?: string;
}

export default function Tabs({
  items,
  label,
  defaultValue,
  className,
}: TabsProps) {
  const baseId = useId();
  const initialIndex = Math.max(
    0,
    items.findIndex((item) => item.id === defaultValue),
  );
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const moveTo = (nextIndex: number) => {
    const clamped =
      (nextIndex + items.length) % items.length;
    setActiveIndex(clamped);
    tabRefs.current[clamped]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        moveTo(activeIndex + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        moveTo(activeIndex - 1);
        break;
      case "Home":
        event.preventDefault();
        moveTo(0);
        break;
      case "End":
        event.preventDefault();
        moveTo(items.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div className={cx("flex flex-col gap-6", className)}>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex flex-wrap gap-2 border-b border-border-subtle"
      >
        {items.map((item, index) => {
          const selected = index === activeIndex;
          return (
            <button
              key={item.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-controls={`${baseId}-panel-${item.id}`}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveIndex(index)}
              className={cx(
                "dd-focus -mb-px border-b-2 px-4 py-3 text-sm font-medium transition-colors duration-dd-fast ease-dd-soft",
                selected
                  ? "border-accent text-accent-text"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {items.map((item, index) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${baseId}-panel-${item.id}`}
          aria-labelledby={`${baseId}-tab-${item.id}`}
          tabIndex={0}
          hidden={index !== activeIndex}
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
