declare const MonotonicTimestampMsBrand: unique symbol;
/**
 * A monotonic timestamp in milliseconds.
 * Unlike Date.now(), monotonic time is immune to NTP adjustments.
 * Values are relative to an arbitrary origin (typically process start).
 */
export type MonotonicTimestampMs = number & { [MonotonicTimestampMsBrand]: never };
