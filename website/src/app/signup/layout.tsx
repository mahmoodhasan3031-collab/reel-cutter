import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Account",
  description: "Create a Reel Cutter account to manage your purchases and licenses.",
  robots: "noindex, nofollow",
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
