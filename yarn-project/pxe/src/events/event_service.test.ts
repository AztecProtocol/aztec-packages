import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { Logger } from '@aztec/foundation/log';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { EventSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
import { computePrivateEventCommitment, siloNullifier } from '@aztec/stdlib/hash';
import { makeBlockHeader } from '@aztec/stdlib/testing';
import { TxEffect } from '@aztec/stdlib/tx';

import { mock } from 'jest-mock-extended';

import type { EventValidationRequest } from '../contract_function_simulator/noir-structs/event_validation_request.js';
import { PrivateEventStore } from '../storage/private_event_store/private_event_store.js';
import { EventService, type EventValidationTxData } from './event_service.js';

describe('validateAndStoreEvents', () => {
  let blockNumber: BlockNumber;
  let eventSelector: EventSelector;
  let randomness: Fr;
  let eventContent: Fr[];
  let eventCommitment: Fr;
  let eventNullifier: Fr;
  let txEffect: TxEffect;
  let validationTxData: EventValidationTxData;
  let contractAddress: AztecAddress;
  let recipient: AztecAddress;

  let privateEventStore: PrivateEventStore;
  let logger: ReturnType<typeof mock<Logger>>;

  let eventService: EventService;

  // beforeEach sets up the happy path case, so error modes are tested
  // by minimally failing happy path conditions
  beforeEach(async () => {
    const store = await openTmpStore('test');
    privateEventStore = new PrivateEventStore(store);
    // Leave a change set open for the tests to operate under: every store operation requires one.
    privateEventStore.beginChangeSet('test');

    contractAddress = await AztecAddress.random();
    recipient = await AztecAddress.random();

    blockNumber = BlockNumber(42);
    eventSelector = EventSelector.random();
    randomness = Fr.random();
    eventContent = [Fr.random(), Fr.random()];

    eventCommitment = await computePrivateEventCommitment(randomness, eventSelector.toField(), eventContent);
    eventNullifier = await siloNullifier(contractAddress, eventCommitment);

    txEffect = TxEffect.from({
      ...(await TxEffect.random()),
      nullifiers: [eventNullifier],
    });

    validationTxData = {
      l2BlockNumber: blockNumber,
      l2BlockHash: BlockHash.random(),
      nullifiers: txEffect.nullifiers,
      txIndexInBlock: 0,
    };

    /* Happy path context conditions:
     ** - PXE is sync'd to _at least_ block including tx
     ** - Caller provides the corresponding tx effect via the prefetched map and the tx effect includes the event
     **   commitment.
     */
    const anchorBlockHeader = makeBlockHeader(0, { blockNumber });

    logger = mock<Logger>();
    eventService = new EventService(anchorBlockHeader, privateEventStore, 'test', logger);
  });

  async function runStoreEvent(
    overrides: {
      eventContent?: Fr[];
      eventCommitment?: Fr;
      validationTxDataMap?: Map<string, EventValidationTxData>;
    } = {},
  ) {
    const request: EventValidationRequest = {
      contractAddress,
      eventTypeId: eventSelector,
      randomness,
      serializedEvent: overrides.eventContent ?? eventContent,
      eventCommitment: overrides.eventCommitment ?? eventCommitment,
      txHash: txEffect.txHash,
    };

    const map = overrides.validationTxDataMap ?? defaultValidationTxDataMap();
    await eventService.validateAndStoreEvents([request], recipient, map);

    await privateEventStore.commitChangeSet('test');
    privateEventStore.beginChangeSet('test');
  }

  it('should throw when tx does not exist or has no effects', async () => {
    const validationTxDataMap = new Map();
    await expect(() => runStoreEvent({ validationTxDataMap })).rejects.toThrow(/Could not find tx effect for tx hash/);
  });

  it('should throw when tx block has not yet been synchronized', async () => {
    const laterTxData = { ...validationTxData, l2BlockNumber: BlockNumber(blockNumber + 1) };
    const validationTxDataMap = new Map([[txEffect.txHash.toString(), laterTxData]]);
    await expect(() => runStoreEvent({ validationTxDataMap })).rejects.toThrow(
      /Obtained a newer tx effect for .* for an event validation request than the anchor block/,
    );
  });

  it('should not store event if event commitment is not in the tx effects', async () => {
    // Use a valid (content -> commitment) pair that just isn't present in the tx.
    const otherContent = [Fr.random()];
    const otherCommitment = await computePrivateEventCommitment(randomness, eventSelector.toField(), otherContent);

    await runStoreEvent({ eventContent: otherContent, eventCommitment: otherCommitment });

    const result = await readEvents();

    expect(result.length).toEqual(0);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/commitment is not present in its tx/));
  });

  it('should not store event if content does not match the event commitment', async () => {
    // Commitment is legitimately present in the tx, but the provided content does not hash to it.
    await runStoreEvent({ eventContent: [Fr.random(), Fr.random()] });

    const result = await readEvents();

    expect(result.length).toEqual(0);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/content does not hash to the provided commitment/));
  });

  it('should store event for later retrieval', async () => {
    await runStoreEvent();

    // I should be able to retrieve the private event I just saved using getPrivateEvents
    const result = await readEvents();

    expect(result.length).toEqual(1);
    expect(result[0].packedEvent).toEqual(eventContent);
  });

  function defaultValidationTxDataMap() {
    return new Map([[txEffect.txHash.toString(), validationTxData]]);
  }

  /** Reads the fixture's events through the change set the tests operate under. */
  function readEvents() {
    return privateEventStore.getPrivateEvents(
      eventSelector,
      { contractAddress, fromBlock: blockNumber, toBlock: blockNumber + 1, scopes: [recipient] },
      'test',
    );
  }
});
