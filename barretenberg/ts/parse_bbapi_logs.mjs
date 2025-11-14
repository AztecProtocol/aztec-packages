#!/usr/bin/env node
/**
 * Parse and display BBAPI log files
 * Usage: node parse_bbapi_logs.mjs <log_file.msgpack>
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
const require = createRequire(import.meta.url);
const { Decoder } = require('msgpackr');

function parseLogFile(filepath) {
  console.log(`\n=== Parsing BBAPI Log File ===`);
  console.log(`File: ${filepath}\n`);

  // Read the file
  const buffer = readFileSync(filepath);
  console.log(`Total file size: ${buffer.length} bytes\n`);

  const decoder = new Decoder({ useRecords: false });
  let offset = 0;
  let entryNum = 1;

  while (offset < buffer.length) {
    // Read 4-byte size prefix (little-endian)
    if (offset + 4 > buffer.length) {
      console.error(`\n✗ Error: Incomplete size prefix at offset ${offset}`);
      break;
    }

    const size = buffer.readUInt32LE(offset);
    offset += 4;

    // Read msgpack data
    if (offset + size > buffer.length) {
      console.error(`\n✗ Error: Incomplete msgpack data at offset ${offset} (expected ${size} bytes, only ${buffer.length - offset} available)`);
      break;
    }

    const msgpackData = buffer.subarray(offset, offset + size);
    offset += size;

    // Decode the request
    try {
      const decoded = decoder.unpack(msgpackData);
      const [commandName, commandData] = decoded[0];

      console.log(`Entry #${entryNum}:`);
      console.log(`  Size: ${size} bytes`);
      console.log(`  Command: ${commandName}`);
      console.log(`  Data:`, JSON.stringify(commandData, null, 4).split('\n').map((line, i) => i === 0 ? line : `        ${line}`).join('\n'));
      console.log('');

      entryNum++;
    } catch (e) {
      console.error(`\n✗ Error decoding entry #${entryNum}:`, e.message);
      console.error(`  Raw data (hex):`, msgpackData.toString('hex').substring(0, 100) + '...');
      console.log('');
      entryNum++;
    }
  }

  console.log(`\n=== Parsed ${entryNum - 1} entries ===\n`);
}

// Main
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node parse_bbapi_logs.mjs <log_file.msgpack>');
  console.error('\nExample:');
  console.error('  node parse_bbapi_logs.mjs /tmp/bbapi-test/bbapi-logs-2025-11-14T12-11-01-291Z.msgpack');
  process.exit(1);
}

const logFile = args[0];

try {
  parseLogFile(logFile);
} catch (error) {
  console.error('\n✗ Failed to parse log file:', error.message);
  process.exit(1);
}
