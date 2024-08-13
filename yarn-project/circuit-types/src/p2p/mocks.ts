import { Fr } from "@aztec/foundation/fields";
import { BlockProposal } from "./block_proposal.js";
import { Signature } from "./signature.js";
import { TxHash } from "../tx/tx_hash.js";
import { makeHeader } from "@aztec/circuits.js/testing";
import { BlockAttestation } from "./block_attestation.js";
import { PrivateKeyAccount } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

export const makeBlockProposal = async (signer?: PrivateKeyAccount): Promise<BlockProposal> => {
  signer = signer || randomSigner();

  const blockHeader = makeHeader(1);
  const archive = Fr.random();
  const txs = [0, 1, 2, 3, 4, 5].map(() => TxHash.random());
  const digest = `0x${archive.toBuffer().toString('hex')}` as `0x${string}`;
  const signature = Signature.from0xString(await signer.signMessage({ message: {raw: digest} }));

  return new BlockProposal(blockHeader, archive, txs, signature);
};


export const makeBlockAttestation = async (signer?: PrivateKeyAccount): Promise<BlockAttestation> => {
  signer = signer || randomSigner();

  const blockHeader = makeHeader(1);
  const archive = Fr.random();
  const digest = `0x${archive.toBuffer().toString('hex')}` as `0x${string}`;
  const signature = Signature.from0xString(await signer.signMessage({ message: { raw: digest }}));

  return new BlockAttestation(blockHeader, archive, signature);
};

export const randomSigner = (): PrivateKeyAccount => {
    const privateKey = generatePrivateKey();
    return privateKeyToAccount(privateKey);
}