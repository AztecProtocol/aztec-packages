export class BaseError extends Error {
  constructor(name: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = name;

    // Capture the stack trace, excluding the constructor call itself.
    Error.captureStackTrace?.(this, this.constructor);

    // Optionally, adjust the stack trace further to remove static method frames.
    this.adjustStackTrace();
  }

  private adjustStackTrace() {
    if (this.stack) {
      const stack = this.stack.split('\n');
      this.stack = [stack[0], ...stack.slice(2)].join('\n');
    }
  }
}

export class MessageBoxError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super('MessageBoxes', message, options);
  }

  static messageNotFound(entryKey: { toString(): string } | string): MessageBoxError {
    return new MessageBoxError(`Message not found. EntryKey ${entryKey.toString()}`);
  }

  static messageNotConfirmed(entryKey: { toString(): string } | string): MessageBoxError {
    return new MessageBoxError(`Message not confirmed. EntryKey: ${entryKey.toString()}`);
  }

  static messageUndefinedEntryKey(): MessageBoxError {
    return new MessageBoxError('Message does not have an entry key');
  }

  static messageCannotBeRemoved(entryKey: { toString(): string } | string): MessageBoxError {
    return new MessageBoxError(`Message cannot be removed as it is not in the store. EntryKey: ${entryKey.toString()}`);
  }
}

export class ArchiverError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super('Archiver', message, options);
  }

  static alreadyRunning(): ArchiverError {
    return new ArchiverError('Archiver is already running');
  }

  static blockNumberMismatch(expected: bigint, real: bigint): ArchiverError {
    return new ArchiverError(`Block number mismatch. Expected value: ${expected}, actual value: ${real}`);
  }

  static missingTxHash(): ArchiverError {
    return new ArchiverError('Missing Transaction Hash');
  }

  static unexpectedMethodCall(method: string): ArchiverError {
    return new ArchiverError(`Unexpected method call. Method name: ${method}`);
  }

  static invalidBlockRange(start: number, limit: number): ArchiverError {
    return new ArchiverError(`Invalid block range. Start: ${start}, limit: ${limit}`);
  }

  static contractDataNotFound(blockNumber: number, txIndex: number): ArchiverError {
    return new ArchiverError(`Contract data not found. Block number: ${blockNumber}, tx-index: ${txIndex}`);
  }
}
