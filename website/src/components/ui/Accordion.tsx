"use client";

import { useId, useState, type ReactNode } from "react";
import { cx } from "./cx";
import Icon from "./Icon";

export interface AccordionItem {
  id: string;
  question: ReactNode;
  answer: ReactNode;
}

export interface AccordionProps {
  items: AccordionItem[];
  allowMultiple?: boolean;
  defaultOpenIds?: string[];
  className?: string;
}

export default function Accordion({
  items,
  allowMultiple = false,
  defaultOpenIds = [],
  className,
}: AccordionProps) {
  const baseId = useId();
  const [openIds, setOpenIds] = useState<string[]>(defaultOpenIds);

  const toggle = (id: string) => {
    setOpenIds((current) => {
      const isOpen = current.includes(id);
      if (allowMultiple) {
        return isOpen
          ? current.filter((openId) => openId !== id)
          : [...current, id];
      }
      return isOpen ? [] : [id];
    });
  };

  return (
    <div className={cx("flex flex-col", className)}>
      {items.map((item) => {
        const open = openIds.includes(item.id);
        const triggerId = `${baseId}-trigger-${item.id}`;
        const panelId = `${baseId}-panel-${item.id}`;
        return (
          <div key={item.id} className="border-b border-border-subtle">
            <h3>
              <button
                type="button"
                id={triggerId}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggle(item.id)}
                className={cx(
                  "dd-focus flex w-full items-center justify-between gap-4 rounded-dd-sm py-4 text-left text-base font-medium text-foreground transition-colors duration-dd-fast ease-dd-soft hover:text-accent-text",
                )}
              >
                <span>{item.question}</span>
                <Icon
                  name={open ? "minus" : "plus"}
                  size={20}
                  className="text-muted-foreground"
                />
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={triggerId}
              hidden={!open}
              className="pb-4 pr-8"
            >
              <div className="dd-body text-muted-foreground">{item.answer}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
