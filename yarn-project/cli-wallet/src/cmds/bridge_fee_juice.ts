import { L1FeeJuicePortalManager, type PXE } from '@aztec/aztec.js';
import { prettyPrintJSON } from '@aztec/cli/utils';
import { createEthereumChain, createExtendedL1Client } from '@aztec/ethereum';
import { Fr } from '@aztec/foundation/fields';
import type { LogFn, Logger } from '@aztec/foundation/log';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

export async function bridgeL1FeeJuice(
  recipient: AztecAddress,
  pxe: PXE,
  l1RpcUrls: string[],
  chainId: number,
  privateKey: string | undefined,
  mnemonic: string,
  json: boolean,
  wait: boolean,
  interval = 60_000,
  log: LogFn,
  debugLogger: Logger,
) {
  // Prepare L1 client
  const chain = createEthereumChain(l1RpcUrls, chainId);
  const client = createExtendedL1Client(chain.rpcUrls, privateKey ?? mnemonic, chain.chainInfo);

  const {
    protocolContractAddresses: { feeJuice: feeJuiceAddress },
  } = await pxe.getPXEInfo();

  // Setup portal manager
  const portal = await L1FeeJuicePortalManager.new(pxe, client, debugLogger);
  const { claimAmount, claimSecret, messageHash, messageLeafIndex } = await portal.bridgeTokensFromFaucet(recipient);

  if (json) {
    const out = {
      claimAmount,
      claimSecret,
      messageLeafIndex,
    };
    log(prettyPrintJSON(out));
  } else {
    log(`Minted ${claimAmount} fee juice on L1 and pushed to L2 portal`);
    log(
      `claimAmount=${claimAmount},claimSecret=${claimSecret},messageHash=${messageHash},messageLeafIndex=${messageLeafIndex}\n`,
    );
    log(`Note: You need to wait for two L2 blocks before pulling them from the L2 side`);
    if (wait) {
      log(
        `This command will now continually poll every ${
          interval / 1000
        }s for the inclusion of the newly created L1 to L2 message`,
      );
    }
  }

  if (wait) {
    const delayedCheck = (delay: number) => {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          void pxe
            .getL1ToL2MembershipWitness(feeJuiceAddress, Fr.fromHexString(messageHash), claimSecret)
            .then(witness => resolve(witness))
            .catch(err => reject(err));
        }, delay);
      });
    };

    let witness;

    while (!witness) {
      witness = await delayedCheck(interval);
      if (!witness) {
        log(`No L1 to L2 message found yet, checking again in ${interval / 1000}s`);
      }
    }
  }

  return [claimSecret, messageLeafIndex, claimAmount] as const;
}
