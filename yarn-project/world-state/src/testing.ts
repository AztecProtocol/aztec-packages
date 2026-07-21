import { GENESIS_ARCHIVE_ROOT } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { computeFeePayerBalanceLeafSlot } from '@aztec/protocol-contracts/fee-juice';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { MerkleTreeId, PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import type { GenesisData } from '@aztec/stdlib/world-state';

import { NativeWorldStateService } from './native/index.js';

async function generateGenesisValues(genesis: GenesisData) {
  // The GENESIS_ARCHIVE_ROOT constant reflects the canonical empty genesis (no public data, no prefilled nullifiers,
  // timestamp 0), so we can only short-circuit when this genesis adds none of those on top.
  if (!genesis.prefilledPublicData.length && genesis.genesisTimestamp === 0n && !genesis.prefilledNullifiers?.length) {
    return {
      genesisArchiveRoot: new Fr(GENESIS_ARCHIVE_ROOT),
    };
  }

  // Compute the genesis values on a throwaway world state. The archive root derives deterministically from the
  // prefilled public data, the prefilled nullifiers, and the genesis timestamp, so the fsync-off ephemeral store (no
  // version manager, no crash-recoverability) produces an identical root while skipping the fsync overhead that `tmp`
  // pays. close() removes the tmpdir.
  const ws = await NativeWorldStateService.ephemeral(genesis);
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
  prefilledNullifiers: Fr[] = [],
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

  // The indexed nullifier tree requires its prefilled leaves to be unique and strictly increasing, so sort ascending
  // here (a copy, to avoid mutating the caller's array) rather than relying on the caller's ordering.
  const sortedNullifiers = [...prefilledNullifiers].sort((a, b) => (a.toBigInt() < b.toBigInt() ? -1 : 1));

  const genesis: GenesisData = { prefilledPublicData, prefilledNullifiers: sortedNullifiers, genesisTimestamp };
  const { genesisArchiveRoot } = await generateGenesisValues(genesis);

  return {
    genesisArchiveRoot,
    genesis,
    fundingNeeded: BigInt(initialAccounts.length) * initialAccountFeeJuice.toBigInt(),
  };
}
