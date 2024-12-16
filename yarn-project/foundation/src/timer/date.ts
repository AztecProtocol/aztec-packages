import { createLogger } from '../log/pino-logger.js';

/** Returns current datetime. */
export class DateProvider {
  public now(): number {
    return Date.now();
  }
}

/** Returns current datetime and allows to override it. */
export class TestDateProvider implements DateProvider {
  private offset = 0;

  constructor(private readonly logger = createLogger('foundation:test-date-provider')) {}

  public now(): number {
    return Date.now() + this.offset;
  }

  public setTime(timeMs: number) {
    this.offset = timeMs - Date.now();
    this.logger.warn(`Time set to ${timeMs}`);
  }
}
