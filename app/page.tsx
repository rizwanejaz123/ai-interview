import Link from "next/link";

import { primaryAction, ReviewShell, secondaryAction } from "@/components/review-shell";

export default function HomePage() {
  return (
    <ReviewShell
      homeLink={false}
      title="Technical interviews"
      subtitle="Upload a resume for a live interview, or open a session for review."
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/apply" className={primaryAction}>
          Upload resume & interview
        </Link>
        <Link href="/admin" className={secondaryAction}>
          Admin review
        </Link>
      </div>
    </ReviewShell>
  );
}
