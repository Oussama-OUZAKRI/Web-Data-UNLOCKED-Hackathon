import type { Investigation } from "@/lib/types";

export function shouldAcceptInvestigationUpdate(
  current: Investigation | null,
  incoming: Investigation
) {
  if (!current || current.id !== incoming.id) return true;
  return incoming.version >= current.version;
}

export function mergeInvestigationHistory(history: Investigation[], incoming: Investigation) {
  return [incoming, ...history.filter((item) => item.id !== incoming.id)].slice(0, 6);
}
