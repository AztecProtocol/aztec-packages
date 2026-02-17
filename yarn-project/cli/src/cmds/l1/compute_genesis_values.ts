import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import type { LogFn } from '@aztec/foundation/log';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import { getGenesisValues } from '@aztec/world-state/testing';

import { getSponsoredFPCAddress } from '../../utils/setup_contracts.js';

/** Computes and prints genesis values needed for L1 contract deployment. */
export async function computeGenesisValuesCmd(testAccounts: boolean, sponsoredFPC: boolean, log: LogFn) {
  const initialAccounts = testAccounts ? await getInitialTestAccountsData() : [];
  const sponsoredFPCAddresses = sponsoredFPC ? await getSponsoredFPCAddress() : [];
  const initialFundedAccounts = initialAccounts.map(a => a.address).concat(sponsoredFPCAddresses);
  const { genesisArchiveRoot } = await getGenesisValues(initialFundedAccounts);

  const { getVKTreeRoot } = await import('@aztec/noir-protocol-circuits-types/vk-tree');
  const vkTreeRoot = getVKTreeRoot();

  log(
    JSON.stringify(
      {
        vkTreeRoot: vkTreeRoot.toString(),
        protocolContractsHash: protocolContractsHash.toString(),
        genesisArchiveRoot: genesisArchiveRoot.toString(),
      },
      null,
      2,
    ),
  );
}
