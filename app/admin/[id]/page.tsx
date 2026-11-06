import { Suspense } from "react";

import { ReviewShell } from "@/components/review-shell";

import { AdminReportView } from "./report";

export default function AdminReportPage() {
  return (
    <Suspense fallback={<ReviewShell signOut title="Session">Loading report…</ReviewShell>}>
      <AdminReportView />
    </Suspense>
  );
}
