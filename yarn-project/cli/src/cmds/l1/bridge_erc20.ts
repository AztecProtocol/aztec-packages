import { type AztecAddress, type EthAddress, type Fr, L1ToL2TokenPortalManager } from '@aztec/aztec.js';
import { createEthereumChain, createExtendedL1Client } from '@aztec/ethereum';
import type { LogFn, Logger } from '@aztec/foundation/log';

import { prettyPrintJSON } from '../../utils/commands.js';

export async function bridgeERC20(
  amount: bigint,
  recipient: AztecAddress,
  l1RpcUrls: string[],
  chainId: number,
  privateKey: string | undefined,
  mnemonic: string,
  tokenAddress: EthAddress,
  portalAddress: EthAddress,
  privateTransfer: boolean,
  mint: boolean,
  json: boolean,
  log: LogFn,
  debugLogger: Logger,
) {
  // Prepare L1 client
  const chain = createEthereumChain(l1RpcUrls, chainId);
  const l1Client = createExtendedL1Client(chain.rpcUrls, privateKey ?? mnemonic, chain.chainInfo);

  // Setup portal manager
  const manager = new L1ToL2TokenPortalManager(portalAddress, tokenAddress, l1Client, debugLogger);
  let claimSecret: Fr;
  let messageHash: `0x${string}`;
  if (privateTransfer) {
    ({ claimSecret, messageHash } = await manager.bridgeTokensPrivate(recipient, amount, mint));
  } else {
    ({ claimSecret, messageHash } = await manager.bridgeTokensPublic(recipient, amount, mint));
  }

  if (json) {
    log(
      prettyPrintJSON({
        claimAmount: amount,
        claimSecret: claimSecret,
      }),
    );
  } else {
    if (mint) {
      log(`Minted ${amount} tokens on L1 and pushed to L2 portal`);
    } else {
      log(`Bridged ${amount} tokens to L2 portal`);
    }
    log(`claimAmount=${amount},claimSecret=${claimSecret}\n,messageHash=${messageHash}`);
    log(`Note: You need to wait for two L2 blocks before pulling them from the L2 side`);
  }
}
