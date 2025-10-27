export class BlobDeserializationError extends Error {
  constructor(message: string, opts: { cause?: unknown } = {}) {
    super(message, opts);
    this.name = 'BlobDeserializationError';
  }
}
