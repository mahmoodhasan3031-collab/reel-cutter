export type ClassValue =
  | string
  | false
  | null
  | undefined
  | ClassValue[];

export function cx(...values: ClassValue[]): string {
  const out: string[] = [];
  for (const value of values) {
    if (!value) continue;
    if (Array.isArray(value)) {
      const nested = cx(...value);
      if (nested) out.push(nested);
      continue;
    }
    out.push(value);
  }
  return out.join(" ");
}
