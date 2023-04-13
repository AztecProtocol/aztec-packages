/**
 * The Timer class is a versatile utility for measuring elapsed time in both milliseconds and seconds.
 * It simplifies the process of calculating time intervals by internally handling date and time operations.
 * Upon instantiation, it records the current time as the starting point, which can be compared to
 * the actual time at any subsequent calls. Use the ms() function to retrieve the elapsed time in milliseconds,
 * or the s() function to obtain the duration in seconds.
 */
export class Timer {
  private start: number;

  constructor() {
    this.start = new Date().getTime();
  }

  /**
 * Returns the elapsed time in milliseconds since the Timer instance was created.
 * The returned value is based on the difference between the current time and the
 * start time of the Timer instance. This method allows for precise measurement of
 * durations in milliseconds.
 *
 * @returns The elapsed time in milliseconds.
 */
public ms() {
    return new Date().getTime() - this.start;
  }

  /**
 * Returns the elapsed time in seconds since the Timer instance was created.
 * The returned value is a floating-point number representing the time difference
 * between the current time and the time when the Timer instance was initialized.
 *
 * @returns The elapsed time in seconds as a number.
 */
public s() {
    return (new Date().getTime() - this.start) / 1000;
  }
}
