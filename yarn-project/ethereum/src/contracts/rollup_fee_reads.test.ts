import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';

import { foundry } from 'viem/chains';

import { getPublicClient } from '../client.js';
import { DefaultL1ContractsConfig } from '../config.js';
import { deployAztecL1Contracts } from '../deploy_aztec_l1_contracts.js';
import { type Anvil, EthCheatCodes, startAnvil } from '../test/index.js';
import type { ViemClient } from '../types.js';
import { RollupContract } from './rollup.js';

// Sequential execution: the ethereum package shares Anvil ports across suites.
describe('RollupContract fee reads', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let publicClient: ViemClient;
  let rollup: RollupContract;
  /** Same rollup read through a client that reports no Multicall3 bytecode, so it takes the fallback path. */
  let rollupWithoutMulticall: RollupContract;
  let cheatCodes: EthCheatCodes;
  let slotDuration: number;
  let l1GenesisTime: bigint;

  beforeAll(async () => {
    const privateKeyRaw = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba';
    ({ anvil, rpcUrl } = await startAnvil());
    publicClient = getPublicClient({ l1RpcUrls: [rpcUrl], l1ChainId: 31337 });
    cheatCodes = new EthCheatCodes([rpcUrl], new DateProvider());

    const deployed = await deployAztecL1Contracts(rpcUrl, privateKeyRaw, foundry.id, {
      ...DefaultL1ContractsConfig,
      vkTreeRoot: Fr.random(),
      protocolContractsHash: Fr.random(),
      genesisArchiveRoot: Fr.random(),
      realVerifier: false,
    });

    const rollupAddress = deployed.l1ContractAddresses.rollupAddress.toString();
    rollup = new RollupContract(publicClient, rollupAddress);
    rollupWithoutMulticall = new RollupContract(
      { ...publicClient, getCode: () => Promise.resolve(undefined) },
      rollupAddress,
    );
    slotDuration = await rollup.getSlotDuration();
    l1GenesisTime = await rollup.getL1GenesisTime();
  }, 60_000);

  afterAll(async () => {
    await cheatCodes.setIntervalMining(0);
    await anvil?.stop().catch(err => createLogger('cleanup').error('Error stopping anvil', err));
  });

  function tsForSlot(slot: number): bigint {
    return l1GenesisTime + BigInt(slot) * BigInt(slotDuration);
  }

  it('reads every fee stage via Multicall3 identically to the parallel individual fallback', async () => {
    const blockNumber = await publicClient.getBlockNumber();
    const options = { blockNumber };
    const { pending, proven } = await rollup.getTips(options);
    const currentSlot = await rollup.getSlotNumber(options);
    const timestamps = [tsForSlot(Number(currentSlot) + 1), tsForSlot(Number(currentSlot) + 2)];

    expect(await rollup.getFeeGlobals(options)).toEqual(await rollupWithoutMulticall.getFeeGlobals(options));
    expect(await rollup.getCheckpoints([pending, proven], options)).toEqual(
      await rollupWithoutMulticall.getCheckpoints([pending, proven], options),
    );
    expect(await rollup.getSlotFeeInputs(timestamps, options)).toEqual(
      await rollupWithoutMulticall.getSlotFeeInputs(timestamps, options),
    );
    expect(await rollup.getL1FeesAndTips(timestamps, options)).toEqual(
      await rollupWithoutMulticall.getL1FeesAndTips(timestamps, options),
    );
  }, 30_000);

  it('pins getManaMinFeeAt to a block number so later blocks do not change the read', async () => {
    const blockNumber = await publicClient.getBlockNumber();
    const currentSlot = await rollup.getSlotNumber({ blockNumber });
    const ts = tsForSlot(Number(currentSlot) + 1);

    const before = await rollup.getManaMinFeeAt(ts, true, { blockNumber });

    // Mine several blocks; the read pinned to the original block must be unchanged.
    await cheatCodes.mine(3);
    const afterPinned = await rollup.getManaMinFeeAt(ts, true, { blockNumber });
    expect(afterPinned).toBe(before);
  });

  it('reads governance values pinned and unmemoized, matching the memoized getters at the same block', async () => {
    const blockNumber = await publicClient.getBlockNumber();
    const [manaTarget, manaLimit, provingCost] = await Promise.all([
      rollup.readManaTarget({ blockNumber }),
      rollup.readManaLimit({ blockNumber }),
      rollup.readProvingCostPerManaInEth({ blockNumber }),
    ]);
    expect(manaTarget).toBe(await rollup.getManaTarget());
    expect(manaLimit).toBe(await rollup.getManaLimit());
    expect(provingCost).toBe(await rollup.getProvingCostPerMana());
  });

  it('supports a blockNumber option on getTips', async () => {
    const blockNumber = await publicClient.getBlockNumber();
    const pinned = await rollup.getTips({ blockNumber });
    const latest = await rollup.getTips();
    expect(pinned.pending).toBe(latest.pending);
    expect(pinned.proven).toBe(latest.proven);
  });
});
