import type { Logger } from '@aztec/foundation/log';

import { exec } from 'child_process';
import { promisify } from 'util';

import { getSequencers } from './nodes.js';

const execAsync = promisify(exec);

/** Parsed l2-block-built stats from a sequencer pod log line. */
export type BlockBuiltLogEntry = {
  blockNumber: number;
  txCount: number;
  duration: number;
  publicProcessDuration: number;
  manaPerSec: number;
  privateLogCount: number;
  publicLogCount: number;
  contractClassLogCount: number;
  contractClassLogSize: number;
};

const FIELDS: (keyof BlockBuiltLogEntry)[] = [
  'blockNumber',
  'txCount',
  'duration',
  'publicProcessDuration',
  'manaPerSec',
  'privateLogCount',
  'publicLogCount',
  'contractClassLogCount',
  'contractClassLogSize',
];

/**
 * Fetches l2-block-built log entries from sequencer pods for given block numbers.
 * Queries all validator pods (only the proposer will have the log for a given block).
 *
 * @param namespace - Kubernetes namespace
 * @param sinceTime - ISO 8601 timestamp to limit log search (e.g., from before block building was re-enabled)
 * @param blockNumbers - Set of block numbers to filter for
 * @param logger - Logger instance
 * @returns Array of parsed BlockBuiltLogEntry, de-duplicated by blockNumber, sorted ascending
 */
export async function fetchBlockBuiltLogs(
  namespace: string,
  sinceTime: string,
  blockNumbers: Set<number>,
  logger: Logger,
): Promise<BlockBuiltLogEntry[]> {
  const pods = await getSequencers(namespace);
  const entriesByBlock = new Map<number, BlockBuiltLogEntry>();

  // Subtract 60s from sinceTime to account for clock skew between test runner and k8s pods.
  // Block number filtering ensures we only match the right blocks, so extra lines are harmless.
  const sinceDate = new Date(new Date(sinceTime).getTime() - 60_000);
  const sinceFlag = sinceDate.toISOString();

  for (const pod of pods) {
    try {
      const cmd = `kubectl logs ${pod} -n ${namespace} -c aztec --since-time=${sinceFlag}`;
      logger.info(`Fetching logs: ${cmd}`);
      const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });

      const lines = stdout.split('\n');
      const matchingLines = lines.filter(l => l.includes('l2-block-built'));
      logger.info(`Pod ${pod}: ${lines.length} log lines, ${matchingLines.length} contain l2-block-built`);

      for (const line of matchingLines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.eventName !== 'l2-block-built' || !blockNumbers.has(parsed.blockNumber)) {
            continue;
          }
          if (entriesByBlock.has(parsed.blockNumber)) {
            continue;
          }
          const entry: BlockBuiltLogEntry = {} as BlockBuiltLogEntry;
          for (const field of FIELDS) {
            entry[field] = parsed[field] ?? 0;
          }
          entriesByBlock.set(entry.blockNumber, entry);
          logger.verbose(`Parsed l2-block-built log for block ${entry.blockNumber}`, entry);
        } catch {
          // Not valid JSON, skip
        }
      }
    } catch (err) {
      logger.warn(`Failed to fetch logs from pod ${pod}: ${err}`);
    }
  }

  if (entriesByBlock.size < blockNumbers.size) {
    const missing = [...blockNumbers].filter(bn => !entriesByBlock.has(bn));
    logger.warn(`Missing l2-block-built logs for block(s): ${missing.join(', ')}`);
  }

  return [...entriesByBlock.values()].sort((a, b) => a.blockNumber - b.blockNumber);
}
