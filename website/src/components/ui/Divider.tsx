import { cx } from "./cx";

export interface DividerProps {
  className?: string;
}

export default function Divider({ className }: DividerProps) {
  return <hr className={cx("dd-divider", className)} />;
}
