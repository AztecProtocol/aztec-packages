import {
  type AccountWallet,
  type AuthWitnessProvider,
  AztecAddress,
  CompleteAddress,
  type NodeInfo,
} from '@aztec/aztec.js';
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

  static createFromUserWallet(wallet: AccountWallet, dappAddress: AztecAddress): DefaultDappInterface {
    return new DefaultDappInterface(wallet, wallet.getCompleteAddress(), dappAddress, {
      l1ChainId: wallet.getChainId().toNumber(),
      rollupVersion: wallet.getVersion().toNumber(),
    });
  }
}
