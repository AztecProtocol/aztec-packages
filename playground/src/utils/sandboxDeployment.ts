// esaus script, using differnet urls rn

import { createLogger, Fr, L1FeeJuicePortalManager } from "@aztec/aztec.js";
import type { PXE } from "@aztec/aztec.js";
import { getSchnorrAccount } from "@aztec/accounts/schnorr";
import { deriveSigningKey } from '@aztec/stdlib/keys';
import { createEthereumChain, createL1Clients } from '@aztec/ethereum';

import { FeeJuicePaymentMethodWithClaim } from '@aztec/aztec.js/fee';

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const l1RpcUrl = "http://34.169.129.31:8545";
const chainId = 1337;
const faucetUrl = "http://104.199.115.217:8086";

export async function deployAccountInSandbox(pxe: PXE, secretKey: Fr, salt: Fr) {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  const chain = createEthereumChain([l1RpcUrl], chainId);
  const { publicClient, walletClient } = createL1Clients(chain.rpcUrls, privateKey, chain.chainInfo);

  const {
    protocolContractAddresses: { feeJuice: feeJuiceAddress },
  } = await pxe.getPXEInfo();

  const url = new URL(`/drip/${account.address.toString()}`, faucetUrl);
  url.searchParams.set('asset', 'ETH');

  const res = await fetch(url);
  if (res.status !== 200) {
    throw new Error('Failed to drip ETH');
  }

  const portal = await L1FeeJuicePortalManager.new(pxe, publicClient, walletClient, createLogger('Portal'));

  const schnorrAccount = await getSchnorrAccount(pxe, secretKey, deriveSigningKey(secretKey), salt);

  const newAccountAddress = schnorrAccount.getAddress();

  const { claimAmount, claimSecret, messageHash, messageLeafIndex } = await portal.bridgeTokensPublic(
    newAccountAddress,
    1000000000000000000n,
    true,
  );

  const delayedCheck = (delay: number) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        void pxe
          .getL1ToL2MembershipWitness(feeJuiceAddress, Fr.fromHexString(messageHash), claimSecret)
          .then(witness => {
            resolve(witness);
          })
          .catch(err => {
            reject(err);
          });
      }, delay);
    });
  };

  let witness;
  let interval = 30000;
  while (!witness) {
    witness = await delayedCheck(interval);
  }

  const feePaymentMethod = new FeeJuicePaymentMethodWithClaim(await schnorrAccount.getWallet(), {
    claimAmount: (typeof claimAmount === 'string'
      ? Fr.fromHexString(claimAmount)
      : new Fr(claimAmount)
    ).toBigInt(),
    claimSecret,
    messageLeafIndex: BigInt(messageLeafIndex),
  });

  return { feePaymentMethod };
}
