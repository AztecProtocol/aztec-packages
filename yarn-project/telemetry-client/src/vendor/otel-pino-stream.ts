/*
 * Adapted from open-telemetry/opentelemetry-js-contrib
 * All changes are prefixed with [aztec] to make them easy to identify
 *
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { type Logger, SeverityNumber, logs } from '@opentelemetry/api-logs';
import { millisToHrTime } from '@opentelemetry/core';
import { Writable } from 'stream';

import { registerOtelLoggerProvider } from '../otel_logger_provider.js';

/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable camelcase */

// This block is a copy (modulo code style and TypeScript types) of the Pino
// code that defines log level value and names. This file is part of
// *instrumenting* Pino, so we want to avoid a dependency on the library.
const DEFAULT_LEVELS = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const OTEL_SEV_NUM_FROM_PINO_LEVEL: { [level: number]: SeverityNumber } = {
  [DEFAULT_LEVELS.trace]: SeverityNumber.TRACE,
  [DEFAULT_LEVELS.debug]: SeverityNumber.DEBUG,
  [DEFAULT_LEVELS.info]: SeverityNumber.INFO,
  [DEFAULT_LEVELS.warn]: SeverityNumber.WARN,
  [DEFAULT_LEVELS.error]: SeverityNumber.ERROR,
  [DEFAULT_LEVELS.fatal]: SeverityNumber.FATAL,
};

const EXTRA_SEV_NUMS = [
  SeverityNumber.TRACE2,
  SeverityNumber.TRACE3,
  SeverityNumber.TRACE4,
  SeverityNumber.DEBUG2,
  SeverityNumber.DEBUG3,
  SeverityNumber.DEBUG4,
  SeverityNumber.INFO2,
  SeverityNumber.INFO3,
  SeverityNumber.INFO4,
  SeverityNumber.WARN2,
  SeverityNumber.WARN3,
  SeverityNumber.WARN4,
  SeverityNumber.ERROR2,
  SeverityNumber.ERROR3,
  SeverityNumber.ERROR4,
  SeverityNumber.FATAL2,
  SeverityNumber.FATAL3,
  SeverityNumber.FATAL4,
];

function severityNumberFromPinoLevel(lvl: number) {
  // Fast common case: one of the known levels
  const sev = OTEL_SEV_NUM_FROM_PINO_LEVEL[lvl];
  if (sev !== undefined) {
    return sev;
  }

  // Otherwise, scale the Pino level range -- 10 (trace) to 70 (fatal+10)
  // -- onto the extra OTel severity numbers (TRACE2, TRACE3, ..., FATAL4).
  // Values below trace (10) map to SeverityNumber.TRACE2, which may be
  // considered a bit weird, but it means the unnumbered levels are always
  // just for exactly matching values.
  const relativeLevelWeight = (lvl - 10) / (70 - 10);
  const otelSevIdx = Math.floor(relativeLevelWeight * EXTRA_SEV_NUMS.length);
  const cappedOTelIdx = Math.min(EXTRA_SEV_NUMS.length - 1, Math.max(0, otelSevIdx));
  const otelSevValue = EXTRA_SEV_NUMS[cappedOTelIdx];
  return otelSevValue;
}

// [aztec] Custom function to map Aztec logging levels to OpenTelemetry severity numbers
function severityNumberFromAztecPinoLevel(lvl: number) {
  return (
    OTEL_SEV_NUM_FROM_PINO_LEVEL[lvl] ??
    /* verbose */ (lvl === 25 ? SeverityNumber.DEBUG3 : undefined) ??
    severityNumberFromPinoLevel(lvl)
  );
}

/**
 * Return a function that knows how to convert the "time" field value on a
 * Pino log record to an OTel LogRecord timestamp value.
 *
 * How to convert the serialized "time" on a Pino log record
 * depends on the Logger's `Symbol(pino.time)` prop, configurable
 * via https://getpino.io/#/docs/api?id=timestamp-boolean-function
 *
 * For example:
 *    const logger = pino({timestamp: pino.stdTimeFunctions.isoTime})
 * results in log record entries of the form:
 *    ,"time":"2024-05-17T22:03:25.969Z"
 * `otelTimestampFromTime` will be given the value of the "time" field:
 *   "2024-05-17T22:03:25.969Z"
 * which should be parsed to a number of milliseconds since the epoch.
 */
export function getTimeConverter(pinoLogger: any, pinoMod: any) {
  const stdTimeFns = pinoMod.stdTimeFunctions;
  const loggerTimeFn = pinoLogger[pinoMod.symbols.timeSym];
  if (loggerTimeFn === stdTimeFns.epochTime) {
    return (time: number) => time;
  } else if (loggerTimeFn === stdTimeFns.unixTime) {
    return (time: number) => time * 1e3;
  } else if (loggerTimeFn === stdTimeFns.isoTime) {
    return (time: string) => new Date(time).getTime();
  } else if (loggerTimeFn === stdTimeFns.nullTime) {
    return () => Date.now();
  } else {
    // The logger has a custom time function. Don't guess.
    return () => NaN;
  }
}

interface OTelPinoStreamOptions {
  messageKey?: string;
  levels: any; // Pino.LevelMapping
  otelTimestampFromTime?: (time: any) => number;
}

/**
 * A Pino stream for sending records to the OpenTelemetry Logs API.
 *
 * - This stream emits an 'unknown' event on an unprocessable pino record.
 *   The event arguments are: `logLine: string`, `err: string | Error`.
 */
export class OTelPinoStream extends Writable {
  private _otelLogger: Logger;
  private _messageKey: string;
  private _levels;
  private _otelTimestampFromTime;

  constructor(options: OTelPinoStreamOptions) {
    super();

    // Note: A PINO_CONFIG event was added to pino (2024-04-04) to send config
    // to transports. Eventually OTelPinoStream might be able to use this
    // for auto-configuration in newer pino versions. The event currently does
    // not include the `timeSym` value that is needed here, however.
    this._messageKey = options.messageKey ?? 'msg';
    this._levels = options.levels;

    // [aztec] The following will break if we set up a custom time function in our logger
    this._otelTimestampFromTime = options.otelTimestampFromTime ?? ((time: number) => time);

    // Cannot use `instrumentation.logger` until have delegating LoggerProvider:
    // https://github.com/open-telemetry/opentelemetry-js/issues/4399
    // [aztec] Use the name of this package
    this._otelLogger = logs.getLogger('@aztec/telemetry-client/otel-pino-stream', '0.1.0');
  }

  override _write(s: string, _encoding: string, callback: Function) {
    try {
      /* istanbul ignore if */
      if (!s) {
        return;
      }

      // Parse, and handle edge cases similar to how `pino-abtract-transport` does:
      // https://github.com/pinojs/pino-abstract-transport/blob/v1.2.0/index.js#L28-L45
      // - Emitting an 'unknown' event on parse error mimicks pino-abstract-transport.
      let recObj;
      try {
        recObj = JSON.parse(s);
      } catch (parseErr) {
        // Invalid JSON suggests a bug in Pino, or a logger configuration bug
        // (a bogus `options.timestamp` or serializer).
        this.emit('unknown', s.toString(), parseErr);
        callback();
        return;
      }
      /* istanbul ignore if */
      if (recObj === null) {
        this.emit('unknown', s.toString(), 'Null value ignored');
        callback();
        return;
      }
      /* istanbul ignore if */
      if (typeof recObj !== 'object') {
        recObj = {
          data: recObj,
        };
      }

      const {
        time,
        [this._messageKey]: body,
        level, // eslint-disable-line @typescript-eslint/no-unused-vars

        // The typical Pino `hostname` and `pid` fields are removed because they
        // are redundant with the OpenTelemetry `host.name` and `process.pid`
        // Resource attributes, respectively. This code cannot change the
        // LoggerProvider's `resource`, so getting the OpenTelemetry equivalents
        // depends on the user using the OpenTelemetry HostDetector and
        // ProcessDetector.
        // https://getpino.io/#/docs/api?id=opt-base
        hostname, // eslint-disable-line @typescript-eslint/no-unused-vars
        pid, // eslint-disable-line @typescript-eslint/no-unused-vars

        // The `trace_id` et al fields that may have been added by the
        // "log correlation" feature are stripped, because they are redundant.
        // trace_id, // eslint-disable-line @typescript-eslint/no-unused-vars
        // span_id, // eslint-disable-line @typescript-eslint/no-unused-vars
        // trace_flags, // eslint-disable-line @typescript-eslint/no-unused-vars

        // [aztec] They are not redundant, we depend on them for correlation.
        // The instrumentation package seems to be adding these fields via a custom hook.
        // We push them from the logger module in foundation, so we don't want to clear them here.
        // We do rename the google-cloud specific fields though, back to their expected names.
        ['logging.googleapis.com/trace']: trace_id,
        ['logging.googleapis.com/spanId']: span_id,
        ['logging.googleapis.com/trace_sampled']: _trace_flags,

        ...attributes
      } = recObj;

      let timestamp = this._otelTimestampFromTime(time);
      if (isNaN(timestamp)) {
        attributes['time'] = time; // save the unexpected "time" field to attributes
        timestamp = Date.now();
      }

      if (span_id && trace_id) {
        attributes['trace_id'] = trace_id;
        attributes['span_id'] = span_id;
      }

      // This avoids a possible subtle bug when a Pino logger uses
      // `time: pino.stdTimeFunctions.unixTime` and logs in the first half-second
      // since process start. The rounding involved results in:
      //    timestamp < performance.timeOrigin
      // If that is passed to Logger.emit() it will be misinterpreted by
      // `timeInputToHrTime` as a `performance.now()` value.
      const timestampHrTime = millisToHrTime(timestamp);

      // Prefer using `stream.lastLevel`, because `recObj.level` can be customized
      // to anything via `formatters.level`
      // (https://getpino.io/#/docs/api?id=formatters-object).
      // const lastLevel = (this as any).lastLevel;

      // [aztec] We do not prefer stream.lastLevel since it's undefined here, as we are running
      // on a worker thread, so we use recObj.level because we know that we won't customize it.
      const lastLevel = recObj.level;

      const otelRec = {
        timestamp: timestampHrTime,
        observedTimestamp: timestampHrTime,
        severityNumber: severityNumberFromAztecPinoLevel(lastLevel),
        severityText: this._levels.labels[lastLevel],
        body,
        attributes,
      };

      this._otelLogger.emit(otelRec);
    } catch (err) {
      // [aztec] Log errors to stderr
      // eslint-disable-next-line no-console
      console.error(`Error in OTelPinoStream: ${err}`);
    }
    callback();
  }
}

// [aztec] Default export that loads the resource information and creates a new otel pino stream.
// Invoked by pino when creating a transport in a worker thread out of this stream.
// Note that the original open-telemetry/opentelemetry-js-contrib was set up to run on the main
// nodejs loop, as opposed to in a worker as pino recommends.
export default async function (options: OTelPinoStreamOptions) {
  const url = process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT;
  // We re-register here because this runs on a worker thread
  await registerOtelLoggerProvider(undefined, url ? new URL(url) : undefined);
  return new OTelPinoStream(options);
}
