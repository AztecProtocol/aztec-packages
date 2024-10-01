import { EpochProofQuote, EpochProofQuotePayload } from '@aztec/aztec.js';
import { EthAddress } from '@aztec/circuits.js';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Secp256k1Signer, keccak256 } from '@aztec/foundation/crypto';
import { RollupAbi } from '@aztec/l1-artifacts';

import { beforeAll } from '@jest/globals';
import {
  type Chain,
  type GetContractReturnType,
  type HttpTransport,
  type PublicClient,
  getAddress,
  getContract,
} from 'viem';

import { type ISnapshotManager, type SubsystemsContext, createSnapshotManager } from '../fixtures/snapshot_manager.js';

/**
 * Tests the creation of epoch proof quotes and their validation on L1
 */
describe('e2e_quote_signature_validation', () => {
  let ctx: SubsystemsContext;
  let rollupContract: GetContractReturnType<typeof RollupAbi, PublicClient<HttpTransport, Chain>>;

  // let logger: DebugLogger;
  let snapshotManager: ISnapshotManager;

  beforeAll(async () => {
    snapshotManager = createSnapshotManager(`prover_coordination/e2e_quote_signing`, process.env.E2E_DATA_PATH);

    ctx = await snapshotManager.setup();

    await ctx.proverNode.stop();

    rollupContract = getContract({
      address: getAddress(ctx.deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString()),
      abi: RollupAbi,
      client: ctx.deployL1ContractsValues.walletClient,
    });
  });

  it('can get domain information from the rollup', async () => {
    const [, name, version, chainId, address] = await rollupContract.read.eip712Domain();
    expect(name).toBe('Aztec Rollup');
    expect(version).toBe('1');
    expect(chainId).toBe(31337n);
    expect(address).toBe(rollupContract.address);
  });

  it('can verify a signed quote on L1', async () => {
    const payload = EpochProofQuotePayload.fromFields({
      epochToProve: 42n,
      validUntilSlot: 100n,
      bondAmount: 1000000000000000000n,
      prover: EthAddress.fromString('0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826'),
      basisPointFee: 5000,
    });

    const signer = new Secp256k1Signer(Buffer32.fromBuffer(keccak256(Buffer.from('cow'))));
    const digest = await rollupContract.read.quoteToDigest([payload.toViemArgs()]);
    const quote = EpochProofQuote.new(Buffer32.fromString(digest), payload, signer);

    await rollupContract.read.verifySignedQuote([quote.toViemArgs()]);
  });
});
