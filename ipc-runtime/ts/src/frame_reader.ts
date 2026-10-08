/**
 * Reassembles length-prefixed frames (`u32 len | len bytes`) from stream
 * chunks. Chunks are queued as they arrive and each frame is copied out once
 * it is complete, so a large frame costs one copy rather than one per chunk,
 * and memory grows only with the bytes the peer has actually sent.
 */
export class FrameReader {
  private chunks: Buffer[] = [];
  private buffered = 0;

  push(chunk: Buffer): void {
    this.chunks.push(chunk);
    this.buffered += chunk.length;
  }

  /** The next frame's length prefix, once its 4 bytes have arrived. */
  peekLength(): number | undefined {
    if (this.buffered < 4) {
      return undefined;
    }
    const head = this.chunks[0];
    if (head.length >= 4) {
      return head.readUInt32LE(0);
    }
    return this.copyOut(4, /*consume=*/ false).readUInt32LE(0);
  }

  /** The next whole frame, length prefix included, once it has fully arrived. */
  next(): Buffer | undefined {
    const len = this.peekLength();
    if (len === undefined || this.buffered < 4 + len) {
      return undefined;
    }
    return this.copyOut(4 + len, /*consume=*/ true);
  }

  private copyOut(n: number, consume: boolean): Buffer {
    const head = this.chunks[0];
    if (head.length >= n) {
      if (consume) {
        this.consume(n);
      }
      return head.subarray(0, n);
    }
    const out = Buffer.allocUnsafe(n);
    let copied = 0;
    for (const chunk of this.chunks) {
      copied += chunk.copy(out, copied, 0, Math.min(chunk.length, n - copied));
      if (copied === n) {
        break;
      }
    }
    if (consume) {
      this.consume(n);
    }
    return out;
  }

  private consume(n: number): void {
    this.buffered -= n;
    while (n > 0) {
      const head = this.chunks[0];
      if (head.length <= n) {
        n -= head.length;
        this.chunks.shift();
      } else {
        this.chunks[0] = head.subarray(n);
        n = 0;
      }
    }
  }
}
