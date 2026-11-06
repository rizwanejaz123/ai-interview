import { parseJoinDetails, type JoinDetails } from "@/lib/vetting";

function key(sessionId: string): string {
  return `vetting.join.${sessionId}`;
}

export function stashJoin(sessionId: string, details: JoinDetails): void {
  sessionStorage.setItem(key(sessionId), JSON.stringify(details));
}

export function readJoin(sessionId: string): JoinDetails | null {
  const raw = sessionStorage.getItem(key(sessionId));
  if (!raw) return null;
  try {
    return parseJoinDetails(JSON.parse(raw));
  } catch {
    return null;
  }
}
