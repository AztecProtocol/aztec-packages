// Parse Log File
// 1. Determine when a message was sent from the Sent Message log
// 2. Parse all Received Tx logs, extracting the timestamp and peer ID
// 3. Compute the delay for each peer relative to the timestamp of the sent message
// 4. Print the delays
import * as fs from 'fs';

interface LogEvent {
  timestamp: number; // in milliseconds (from start of log)
  peerId: string;
}

interface BenchmarkResult {
  delays: {
    peerId: string;
    delay: number;
  }[];
  stats: {
    numberReceived: number;
    minDelay: number;
    maxDelay: number;
    averageDelay: number;
    medianDelay: number;
  };
}

function getTimestamp(line: string): number | null {
  const timestampMatch = line.match(/"time":(\d+)/);
  if (!timestampMatch) {
    return null;
  }
  return parseInt(timestampMatch[1], 10);
}

/**
 * Parses a single log line. If the line contains an "rpc.from" event,
 * it extracts the timestamp and the peer ID.
 */
function parseReceivedTx(line: string): LogEvent | null {
  if (!line.includes('Received tx')) {
    return null;
  }

  // Extract timestamp from the line: e.g. {"time":1740142435845}
  const timestamp = getTimestamp(line);
  if (!timestamp) {
    console.log('No timestamp found in received tx log');
    return null;
  }

  // TODO: this is not correct - it is just the tx hash for now
  // Extract the peer ID after "Received tx"
  const peerIdMatch = line.match(/p2p:(\d+):/);
  if (!peerIdMatch) {
    console.log('No peer Number found in received tx log');
    return null;
  }
  const peerId = peerIdMatch[1];

  return {
    timestamp,
    peerId,
  };
}

function parseSentMessage(line: string): number | null {
  if (!line.includes('Sent message')) {
    return null;
  }

  const timestamp = getTimestamp(line);
  if (!timestamp) {
    console.log('No timestamp found in sent message log');
    return null;
  }

  return timestamp;
}

/**
 * Processes the given log file, extracts all rpc.from events, computes the
 * propagation delay for each peer relative to the earliest event, and prints
 * some benchmark statistics.
 */
function processLogFile(logFilePath: string, outputJsonPath?: string) {
  const content = fs.readFileSync(logFilePath, 'utf-8');
  const lines = content.split('\n');
  const events: LogEvent[] = [];
  let t0 = 0;

  // We begin our search as soon as we see the Sent message log
  let messageSent = false;
  for (const line of lines) {
    // Look for Sent message log
    if (line.includes('Sent message')) {
      messageSent = true;
      t0 = parseSentMessage(line)!;
    }

    if (!messageSent) {
      continue;
    }
    // Once we see the sent message log, we begin parsing Received tx logs
    const event = parseReceivedTx(line);
    if (event) {
      events.push(event);
    }
  }

  if (events.length === 0) {
    console.log('No message received events found in log file.');
    return;
  }

  // Sort events by timestamp (ascending)
  events.sort((a, b) => a.timestamp - b.timestamp);

  // Compute delay for each event relative to t0
  const numberReceived = events.length;
  const delays = events.map(e => ({
    peerId: e.peerId,
    delay: e.timestamp - t0,
  }));

  console.log('Propagation delays (in ms) per peer:');
  for (const d of delays) {
    console.log(`${d.peerId}: ${d.delay} ms`);
  }

  // Compute basic statistics
  const delayValues = delays.map(d => d.delay);
  const minDelay = Math.min(...delayValues);
  const maxDelay = Math.max(...delayValues);
  const sumDelay = delayValues.reduce((sum, val) => sum + val, 0);
  const avgDelay = sumDelay / delayValues.length;
  const sortedDelays = delayValues.slice().sort((a, b) => a - b);
  const medianDelay = sortedDelays[Math.floor(sortedDelays.length / 2)];

  console.log('\nBenchmark Statistics:');
  console.log(`Min delay: ${minDelay} ms`);
  console.log(`Max delay: ${maxDelay} ms`);
  console.log(`Average delay: ${avgDelay.toFixed(2)} ms`);
  console.log(`Median delay: ${medianDelay} ms`);

  // If output JSON path is provided, write results to file
  if (outputJsonPath) {
    const result: BenchmarkResult = {
      delays,
      stats: {
        numberReceived,
        minDelay,
        maxDelay,
        averageDelay: Number(avgDelay.toFixed(2)),
        medianDelay,
      },
    };

    fs.writeFileSync(outputJsonPath, JSON.stringify(result, null, 2));
    console.log(`\nResults written to ${outputJsonPath}`);
  }
}

// Get the log file path and optional output JSON path from command-line arguments
const [logFilePath, outputJsonPath] = process.argv.slice(2);
if (!logFilePath) {
  console.error('Usage: ts-node parse_log_file.ts <logFilePath> [outputJsonPath]');
  process.exit(1);
}

processLogFile(logFilePath, outputJsonPath);
