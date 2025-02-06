export class BlobDeserializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlobDeserializationError';
  }
}
