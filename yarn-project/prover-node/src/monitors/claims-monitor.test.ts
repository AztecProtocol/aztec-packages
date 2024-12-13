import { type EpochProofClaim } from '@aztec/circuit-types';
import { EthAddress } from '@aztec/circuits.js';
import { sleep } from '@aztec/foundation/sleep';
import { type L1Publisher } from '@aztec/sequencer-client';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import { type MockProxy, mock } from 'jest-mock-extended';

import { ClaimsMonitor, type ClaimsMonitorHandler } from './claims-monitor.js';

describe('ClaimsMonitor', () => {
  let l1Publisher: MockProxy<L1Publisher>;
  let handler: MockProxy<ClaimsMonitorHandler>;
  let claimsMonitor: ClaimsMonitor;

  let publisherAddress: EthAddress;

  beforeEach(() => {
    l1Publisher = mock<L1Publisher>();
    handler = mock<ClaimsMonitorHandler>();

    publisherAddress = EthAddress.random();
    l1Publisher.getSenderAddress.mockReturnValue(publisherAddress);

    claimsMonitor = new ClaimsMonitor(l1Publisher, new NoopTelemetryClient(), { pollingIntervalMs: 10 });
  });

  afterEach(async () => {
    await claimsMonitor.stop();
  });

  const makeEpochProofClaim = (epoch: number, bondProvider: EthAddress): MockProxy<EpochProofClaim> => {
    return {
      basisPointFee: 100n,
      bondAmount: 10n,
      bondProvider,
      epochToProve: BigInt(epoch),
      proposerClaimant: EthAddress.random(),
    };
  };

  it('should handle a new claim if it belongs to the prover', async () => {
    const proofClaim = makeEpochProofClaim(1, publisherAddress);
    l1Publisher.getProofClaim.mockResolvedValue(proofClaim);

    claimsMonitor.start(handler);
    await sleep(100);

    expect(handler.handleClaim).toHaveBeenCalledWith(proofClaim);
    expect(handler.handleClaim).toHaveBeenCalledTimes(1);
  });

  it('should not handle a new claim if it does not belong to the prover', async () => {
    const proofClaim = makeEpochProofClaim(1, EthAddress.random());
    l1Publisher.getProofClaim.mockResolvedValue(proofClaim);

    claimsMonitor.start(handler);
    await sleep(100);

    expect(handler.handleClaim).not.toHaveBeenCalled();
  });

  it('should only trigger when a new claim is seen', async () => {
    const proofClaim = makeEpochProofClaim(1, publisherAddress);
    l1Publisher.getProofClaim.mockResolvedValue(proofClaim);

    claimsMonitor.start(handler);
    await sleep(100);

    expect(handler.handleClaim).toHaveBeenCalledWith(proofClaim);
    expect(handler.handleClaim).toHaveBeenCalledTimes(1);

    const proofClaim2 = makeEpochProofClaim(2, publisherAddress);
    l1Publisher.getProofClaim.mockResolvedValue(proofClaim2);
    await sleep(100);

    expect(handler.handleClaim).toHaveBeenCalledWith(proofClaim2);
    expect(handler.handleClaim).toHaveBeenCalledTimes(2);
  });
});
