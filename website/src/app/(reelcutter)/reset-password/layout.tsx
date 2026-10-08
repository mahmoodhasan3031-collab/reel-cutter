import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Set New Password",
  description: "Set your new Reel Cutter account password.",
  robots: "noindex, nofollow",
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
