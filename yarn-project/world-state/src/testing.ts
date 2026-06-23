import { GENESIS_ARCHIVE_ROOT } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { DEFAULT_GENESIS_DATA } from '@aztec/protocol-contracts';
import { computeFeePayerBalanceLeafSlot } from '@aztec/protocol-contracts/fee-juice';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { MerkleTreeId, PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import type { GenesisData } from '@aztec/stdlib/world-state';

import { NativeWorldStateService } from './native/index.js';

async function generateGenesisValues(genesis: GenesisData) {
  // The GENESIS_ARCHIVE_ROOT constant already reflects the canonical prefilled nullifiers (DEFAULT_GENESIS_DATA), so we
  // can short-circuit only when this genesis adds no public data and no custom timestamp on top of that default.
  if (
    !genesis.prefilledPublicData.length &&
    genesis.genesisTimestamp === 0n &&
    genesis.prefilledNullifiers === DEFAULT_GENESIS_DATA.prefilledNullifiers
  ) {
    return {
      genesisArchiveRoot: new Fr(GENESIS_ARCHIVE_ROOT),
    };
  }

  // Create a temporary world state to compute the genesis values.
  const ws = await NativeWorldStateService.tmp(undefined /* rollupAddress */, true /* cleanupTmpDir */, genesis);
  const genesisArchiveRoot = new Fr((await ws.getCommitted().getTreeInfo(MerkleTreeId.ARCHIVE)).root);
  await ws.close();

  return {
    genesisArchiveRoot,
  };
}

export const defaultInitialAccountFeeJuice = new Fr(10n ** 22n);

export async function getGenesisValues(
  initialAccounts: AztecAddress[],
  initialAccountFeeJuice = defaultInitialAccountFeeJuice,
  genesisPublicData: PublicDataTreeLeaf[] = [],
  genesisTimestamp: bigint = 0n,
) {
  // Top up the accounts with fee juice.
  let prefilledPublicData = await Promise.all(
    initialAccounts.map(
      async address => new PublicDataTreeLeaf(await computeFeePayerBalanceLeafSlot(address), initialAccountFeeJuice),
    ),
  );

  // Add user-defined public data
  prefilledPublicData = prefilledPublicData.concat(genesisPublicData);

  prefilledPublicData.sort((a, b) => (b.slot.lt(a.slot) ? 1 : -1));

  // Build on top of DEFAULT_GENESIS_DATA so the canonical protocol contract registration nullifiers are always seeded;
  // only the deployment-specific public data and timestamp vary.
  const genesis: GenesisData = { ...DEFAULT_GENESIS_DATA, prefilledPublicData, genesisTimestamp };
  const { genesisArchiveRoot } = await generateGenesisValues(genesis);

  return {
    genesisArchiveRoot,
    genesis,
    fundingNeeded: BigInt(initialAccounts.length) * initialAccountFeeJuice.toBigInt(),
  };
}
