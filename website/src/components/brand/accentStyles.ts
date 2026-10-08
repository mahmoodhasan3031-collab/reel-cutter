import type { ProductAccent } from "@/data/products";

export interface AccentClasses {
  tile: string;
  text: string;
  border: string;
}

export const ACCENT_CLASSES: Record<ProductAccent, AccentClasses> = {
  brand: {
    tile: "bg-accent-soft text-accent-text",
    text: "text-accent-text",
    border: "border-accent/30",
  },
  success: {
    tile: "bg-success/10 text-success",
    text: "text-success",
    border: "border-success/30",
  },
  warning: {
    tile: "bg-warning/10 text-warning",
    text: "text-warning",
    border: "border-warning/30",
  },
};
