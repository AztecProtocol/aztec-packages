/** Returns the number of bytes in the buffer, excluding any trailing zero bytes. */
export function trimmedBytesLength(buf: Uint8Array): number {
  let end = buf.length;
  while (end > 0 && buf[end - 1] === 0) {
    end--;
  }
  return end;
}
