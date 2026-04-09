/**
 * Generate a temporary client-side ID for TanStack Query optimistic updates.
 *
 * Uses `crypto.randomUUID()` when available (secure contexts: HTTPS or
 * localhost). Falls back to a non-cryptographic random string for insecure
 * contexts — e.g. self-hosted instances reached over plain HTTP on a LAN IP
 * — where `crypto.randomUUID` is `undefined` and would throw `is not a
 * function` if called.
 *
 * The returned ID is only used inside the TanStack Query cache during the
 * optimistic-update phase. It's replaced by the real API-issued UUID once
 * the mutation resolves and the cache is invalidated, so it never reaches
 * the database or escapes the client.
 */
export function tempId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}
