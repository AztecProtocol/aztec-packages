// TODO:
// Read in the given log file as input
// skip to the line in the log file where the sent message is logged
// Index which peers have which node iDs - readable from their index in the log file
// Sort each of the rpc events
// Work out how many nodes received the message on each heartbeat interval
// get the time for propagation
import * as fs from 'fs';
import * as path from 'path';

interface LogEvent {
  timestamp: number; // in milliseconds (from start of log)
  peerId: string;
}

/**
 * Parses a timestamp string in "HH:MM:SS.mmm" format and returns the
 * time in milliseconds.
 */
function parseTimestamp(timeStr: string): number {
  const parts = timeStr.split(':');
  if (parts.length !== 3) {
    throw new Error(`Invalid time format: ${timeStr}`);
  }
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const secParts = parts[2].split('.');
  const seconds = parseInt(secParts[0], 10);
  const milliseconds = secParts[1] ? parseInt(secParts[1], 10) : 0;
  return hours * 3600000 + minutes * 60000 + seconds * 1000 + milliseconds;
}

/**
 * Parses a single log line. If the line contains an "rpc.from" event,
 * it extracts the timestamp and the peer ID.
 */
function parseReceivedTx(line: string): LogEvent | null {
  if (!line.includes('Received tx')) {
    return null;
  }

  // Extract timestamp from the beginning of the line: e.g. [18:36:00.926]
  const timestampMatch = line.match(/^\[(.*?)\]/);
  if (!timestampMatch) {
    return null;
  }
  const timeStr = timestampMatch[1];
  let timestamp: number;
  try {
    timestamp = parseTimestamp(timeStr);
  } catch (err) {
    return null;
  }

  // TODO: this is not correct - it is just the tx hash for now
  // Extract the peer ID after "Received tx"
  const peerMatch = line.match(/Received tx\s+(\S+)/);
  if (!peerMatch) {
    return null;
  }
  const peerId = peerMatch[1];

  return {
    timestamp,
    peerId,
  };
}

function parseSentMessage(line: string): number | null {
  if (!line.includes('Sent message')) {
    return null;
  }

  // Get the timestamp at which the first message was sent
  const timestampMatch = line.match(/^\[(.*?)\]/);
  if (!timestampMatch) {
    return null;
  }
  const timeStr = timestampMatch[1];
  let timestamp: number;
  try {
    timestamp = parseTimestamp(timeStr);
  } catch (err) {
    return null;
  }

  return timestamp;
}

/**
 * Processes the given log file, extracts all rpc.from events, computes the
 * propagation delay for each peer relative to the earliest event, and prints
 * some benchmark statistics.
 */
function processLogFile(logFilePath: string) {
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
    console.log('No rpc.from events found in log file.');
    return;
  }

  // Sort events by timestamp (ascending)
  events.sort((a, b) => a.timestamp - b.timestamp);

  // Compute delay for each event relative to t0
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
}

// Get the log file path from command-line arguments
const logFilePath = process.argv[2];
if (!logFilePath) {
  console.error('Usage: ts-node parse_log_file.ts <logFilePath>');
  process.exit(1);
}

processLogFile(logFilePath);
