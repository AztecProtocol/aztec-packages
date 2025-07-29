import { type Account, type AuthWitnessProvider, AztecAddress, CompleteAddress, type NodeInfo } from '@aztec/aztec.js';
import { DefaultDappEntrypoint } from '@aztec/entrypoints/dapp';

import { DefaultAccountInterface } from '../defaults/account_interface.js';

/**
 * Default implementation for an account interface that uses a dapp entrypoint.
 */
export class DefaultDappInterface extends DefaultAccountInterface {
  constructor(
    authWitnessProvider: AuthWitnessProvider,
    userAddress: CompleteAddress,
    dappAddress: AztecAddress,
    nodeInfo: Pick<NodeInfo, 'l1ChainId' | 'rollupVersion'>,
  ) {
    super(authWitnessProvider, userAddress, nodeInfo);
    this.entrypoint = new DefaultDappEntrypoint(
      userAddress.address,
      authWitnessProvider,
      dappAddress,
      nodeInfo.l1ChainId,
      nodeInfo.rollupVersion,
    );
  }

  static createFromUserAccount(account: Account, dappAddress: AztecAddress): DefaultDappInterface {
    return new DefaultDappInterface(account, account.getCompleteAddress(), dappAddress, {
      l1ChainId: account.getChainId().toNumber(),
      rollupVersion: account.getVersion().toNumber(),
    });
  }
}
