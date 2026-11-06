import { Suspense } from "react";

import { InterviewClient } from "./interview-client";

export default function InterviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-300">
          Opening interview…
        </div>
      }
    >
      <InterviewClient />
    </Suspense>
  );
}
