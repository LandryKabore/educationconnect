/** Copy text to clipboard; works in browser and Electron (incl. when Clipboard API is denied). */
export async function copyToClipboard(text: string): Promise<boolean> {
  const value = text ?? "";
  if (!value) return false;

  const desktop = (
    window as Window & {
      edufasoDesktop?: { writeClipboardText?: (t: string) => boolean };
    }
  ).edufasoDesktop;
  if (desktop?.writeClipboardText) {
    try {
      if (desktop.writeClipboardText(value)) return true;
    } catch {
      /* fall through */
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      /* fall through */
    }
  }

  try {
    const el = document.createElement("textarea");
    el.value = value;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.left = "-9999px";
    el.style.top = "0";
    document.body.appendChild(el);
    el.focus();
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
