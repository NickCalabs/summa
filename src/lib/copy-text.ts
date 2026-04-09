/**
 * Copy text to the clipboard with a secure-context fallback.
 *
 * `navigator.clipboard.writeText` is gated on a "secure context" (HTTPS or
 * localhost). Summa's primary deployment — a self-hoster reaching their CT
 * over plain HTTP on a LAN IP — is NOT a secure context, so
 * `navigator.clipboard` is `undefined` there and calling it throws.
 *
 * Falls back to the legacy `document.execCommand("copy")` via an off-screen
 * textarea, which is deprecated but still works everywhere we care about.
 * If that also fails (headless test env, SSR), resolves to `false` so the
 * caller can show a graceful "copy failed, select and copy manually" hint.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the execCommand path.
    }
  }

  if (typeof document === "undefined") return false;

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    // Keep the textarea off-screen and out of layout.
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
