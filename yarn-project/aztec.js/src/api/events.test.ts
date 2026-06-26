import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type EventMetadataDefinition, EventSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { MAX_LOGS_PER_TAG } from '@aztec/stdlib/interfaces/api-limit';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { LogCursor, type LogResult, type PublicLogsQuery, randomLogResult } from '@aztec/stdlib/logs';

import { type MockProxy, mock } from 'jest-mock-extended';

import type { PublicEventFilter } from '../wallet/wallet.js';
import { getPublicEvents } from './events.js';

/** Builds a public log whose decoded payload is `value`. */
function makeLog(value: number, { blockNumber = 1, logIndexWithinTx = 0 } = {}): LogResult {
  return {
    ...randomLogResult(),
    logData: [Fr.random(), new Fr(value)],
    blockNumber: BlockNumber(blockNumber),
    logIndexWithinTx,
  };
}

/** A page of `count` logs carrying consecutive values `start, start+1, …`. */
function page(start: number, count: number): LogResult[] {
  return Array.from({ length: count }, (_, i) => makeLog(start + i, { logIndexWithinTx: i }));
}

describe('getPublicEvents', () => {
  let node: MockProxy<AztecNode>;
  let contractAddress: AztecAddress;
  let eventDef: EventMetadataDefinition;

  beforeEach(async () => {
    node = mock<AztecNode>();
    contractAddress = await AztecAddress.random();
    eventDef = { eventSelector: EventSelector.random(), abiType: { kind: 'field' }, fieldNames: ['value'] };
  });

  const filter = (): PublicEventFilter => ({ contractAddress });

  it('returns all events from a single short page', async () => {
    node.getPublicLogsByTags.mockResolvedValueOnce([page(0, 5)]);

    const { events, maxLogsHit } = await getPublicEvents<bigint>(node, eventDef, filter());

    expect(events.map(e => e.event)).toEqual([0n, 1n, 2n, 3n, 4n]);
    expect(maxLogsHit).toBe(false);
    expect(node.getPublicLogsByTags).toHaveBeenCalledTimes(1);
  });

  it('drains every page and returns all events in order', async () => {
    node.getPublicLogsByTags
      .mockResolvedValueOnce([page(0, MAX_LOGS_PER_TAG)])
      .mockResolvedValueOnce([page(MAX_LOGS_PER_TAG, MAX_LOGS_PER_TAG)])
      .mockResolvedValueOnce([page(2 * MAX_LOGS_PER_TAG, 7)]);

    const { events, maxLogsHit } = await getPublicEvents<bigint>(node, eventDef, filter());

    const total = 2 * MAX_LOGS_PER_TAG + 7;
    expect(events.map(e => e.event)).toEqual(Array.from({ length: total }, (_, i) => BigInt(i)));
    expect(maxLogsHit).toBe(false);
  });

  it('reports maxLogsHit=false when the total is an exact multiple of MAX_LOGS_PER_TAG', async () => {
    // A full first page followed by an empty page: total === MAX_LOGS_PER_TAG. A length-based
    // `maxLogsHit` would mis-report `true` here even though pagination drained to completion.
    node.getPublicLogsByTags.mockResolvedValueOnce([page(0, MAX_LOGS_PER_TAG)]).mockResolvedValueOnce([[]]);

    const { events, maxLogsHit } = await getPublicEvents<bigint>(node, eventDef, filter());

    expect(events).toHaveLength(MAX_LOGS_PER_TAG);
    expect(maxLogsHit).toBe(false);
  });

  it('resumes each follow-up page from the previous page last-log cursor', async () => {
    const firstPage = page(0, MAX_LOGS_PER_TAG);
    const lastLog = firstPage[firstPage.length - 1];
    node.getPublicLogsByTags.mockResolvedValueOnce([firstPage]).mockResolvedValueOnce([page(MAX_LOGS_PER_TAG, 3)]);

    await getPublicEvents<bigint>(node, eventDef, filter());

    const secondQuery = node.getPublicLogsByTags.mock.calls[1][0] as PublicLogsQuery;
    expect(secondQuery.contractAddress).toEqual(contractAddress);
    expect(secondQuery.tags).toHaveLength(1);
    expect((secondQuery.tags[0] as { afterLog: LogCursor }).afterLog).toEqual(LogCursor.fromLog(lastLog));
  });

  it('honors a caller-supplied afterLog as the start-after cursor', async () => {
    const cursor = LogCursor.fromLog(makeLog(0, { blockNumber: 5, logIndexWithinTx: 2 }));
    node.getPublicLogsByTags.mockResolvedValueOnce([page(0, 3)]);

    await getPublicEvents<bigint>(node, eventDef, { contractAddress, afterLog: cursor });

    const firstQuery = node.getPublicLogsByTags.mock.calls[0][0] as PublicLogsQuery;
    expect(firstQuery.contractAddress).toEqual(contractAddress);
    expect((firstQuery.tags[0] as { afterLog: LogCursor }).afterLog).toEqual(cursor);
  });

  it('maps block and tx metadata onto each returned event', async () => {
    const log = makeLog(42, { blockNumber: 7 });
    node.getPublicLogsByTags.mockResolvedValueOnce([[log]]);

    const { events } = await getPublicEvents<bigint>(node, eventDef, filter());

    expect(events[0].metadata).toEqual({
      l2BlockNumber: BlockNumber(7),
      l2BlockHash: log.blockHash,
      txHash: log.txHash,
      contractAddress,
    });
  });
});
