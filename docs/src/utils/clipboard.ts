/**
 * Copies text; call it inside the click handler, since browsers grant clipboard writes only during a
 * user gesture. Falls back to a hidden textarea and `execCommand` where the clipboard API is missing
 * or refused (an insecure origin, an embedding frame without `clipboard-write`).
 *
 * @returns whether the text reached the clipboard
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      textarea.remove();
    }
  }
}
