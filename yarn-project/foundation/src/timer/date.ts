import { createLogger } from '../log/pino-logger.js';

/** Returns current datetime. */
export class DateProvider {
  public now(): number {
    return Date.now();
  }

  public nowInSeconds(): number {
    return Math.floor(this.now() / 1000);
  }

  public nowAsDate(): Date {
    return new Date(this.now());
  }
}

/** Returns current datetime and allows to override it. */
export class TestDateProvider extends DateProvider {
  private offset = 0;

  constructor(private readonly logger = createLogger('foundation:test-date-provider')) {
    super();
  }

  public override now(): number {
    return Date.now() + this.offset;
  }

  public setTime(timeMs: number) {
    this.offset = timeMs - Date.now();
    this.logger.warn(`Time set to ${new Date(timeMs).toISOString()}`, { offset: this.offset, timeMs });
  }

  /** Advances the time by the given number of seconds. */
  public advanceTime(seconds: number) {
    this.offset += seconds * 1000;
  }
}
