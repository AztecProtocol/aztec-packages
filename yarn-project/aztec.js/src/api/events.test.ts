import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type EventMetadataDefinition, EventSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { MAX_LOGS_PER_TAG } from '@aztec/stdlib/interfaces/api-limit';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { LogCursor, type LogResult, type PublicLogsQuery, randomLogResult } from '@aztec/stdlib/logs';

import { type MockProxy, mock } from 'jest-mock-extended';

import { EventCursor, getPublicEvents } from './events.js';

/** Builds a public log whose decoded payload is `value` */
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

  it('returns one page and reports no more when the page is not full', async () => {
    node.getPublicLogsByTags.mockResolvedValueOnce([page(0, 5)]);

    const { events, nextCursor } = await getPublicEvents<bigint>(node, eventDef, { contractAddress });

    expect(events.map(e => e.event)).toEqual([0n, 1n, 2n, 3n, 4n]);
    expect(nextCursor).toBeUndefined();
    expect(node.getPublicLogsByTags).toHaveBeenCalledTimes(1);
  });

  it('returns a nextCursor at the last event when the page is full', async () => {
    const fullPage = page(0, MAX_LOGS_PER_TAG);
    const lastLog = fullPage[fullPage.length - 1];
    node.getPublicLogsByTags.mockResolvedValueOnce([fullPage]).mockResolvedValueOnce([page(MAX_LOGS_PER_TAG, 3)]);

    const { events, nextCursor } = await getPublicEvents<bigint>(node, eventDef, { contractAddress });

    expect(events).toHaveLength(MAX_LOGS_PER_TAG);
    expect(nextCursor).toEqual(EventCursor.fromLogCursor(LogCursor.fromLog(lastLog)));
    expect(node.getPublicLogsByTags).toHaveBeenCalledTimes(1);
  });

  it('honors afterEvent by converting it to the query afterLog cursor', async () => {
    const afterEvent = EventCursor.fromLogCursor(
      LogCursor.fromLog(makeLog(0, { blockNumber: 5, logIndexWithinTx: 2 })),
    );
    node.getPublicLogsByTags.mockResolvedValueOnce([page(0, 3)]);

    await getPublicEvents<bigint>(node, eventDef, { contractAddress, afterEvent });

    const query = node.getPublicLogsByTags.mock.calls[0][0] as PublicLogsQuery;
    expect(query.contractAddress).toEqual(contractAddress);
    expect((query.tags[0] as { afterLog: LogCursor }).afterLog).toEqual(afterEvent.toLogCursor());
  });

  it('maps block and tx metadata onto each returned event', async () => {
    const log = makeLog(42, { blockNumber: 7 });
    node.getPublicLogsByTags.mockResolvedValueOnce([[log]]);

    const { events } = await getPublicEvents<bigint>(node, eventDef, { contractAddress });

    expect(events[0].metadata).toEqual({
      l2BlockNumber: BlockNumber(7),
      l2BlockHash: log.blockHash,
      txHash: log.txHash,
      contractAddress,
    });
  });
});
