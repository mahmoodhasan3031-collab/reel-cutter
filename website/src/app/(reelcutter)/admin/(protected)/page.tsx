import type { Metadata } from "next";
import AdminDashboard from "./AdminDashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default function AdminDashboardPage() {
  return <AdminDashboard />;
}
