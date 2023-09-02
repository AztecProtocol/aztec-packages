import { AztecAddress, Fr, FunctionData, PartialAddress, PrivateKey, TxContext } from '@aztec/circuits.js';
import { Signer } from '@aztec/circuits.js/barretenberg';
import { ContractAbi, encodeArguments } from '@aztec/foundation/abi';
import { FunctionCall, PackedArguments, TxExecutionRequest } from '@aztec/types';

import SchnorrEip1271AccountContractAbi from '../../abis/schnorr_eip_1271_account_contract.json' assert { type: 'json' };
import { generatePublicKey } from '../../index.js';
import { DEFAULT_CHAIN_ID, DEFAULT_VERSION } from '../../utils/defaults.js';
import { buildPayload, hashPayload } from './entrypoint_payload.js';
import { CreateTxRequestOpts, Entrypoint } from './index.js';

/**
 * Account contract implementation that uses a single key for signing and encryption. This public key is not
 * stored in the contract, but rather verified against the contract address. Note that this approach is not
 * secure and should not be used in real use cases.
 */
export class Eip1271AccountEntrypoint implements Entrypoint {
  constructor(
    private address: AztecAddress,
    private partialAddress: PartialAddress,
    private privateKey: PrivateKey,
    private signer: Signer,
    private chainId: number = DEFAULT_CHAIN_ID,
    private version: number = DEFAULT_VERSION,
  ) {}

  public sign(message: Buffer) {
    return this.signer.constructSignature(message, this.privateKey).toBuffer();
  }

  async createEip1271Witness(message: Buffer) {
    const signature = this.sign(message);
    const publicKey = await generatePublicKey(this.privateKey);

    const publicKeyBytes = publicKey.toBuffer();
    const sigFr: Fr[] = [];
    const pubKeyFr: Fr[] = [];
    for (let i = 0; i < 64; i++) {
      pubKeyFr.push(new Fr(publicKeyBytes[i]));
      sigFr.push(new Fr(signature[i]));
    }

    return [...publicKey.toFields(), ...sigFr, this.partialAddress];
  }

  /**
   * Returns the transaction request and the eip1271 witness for the given function calls.
   * Returning the witness here as a nonce is generated in the buildPayload action.
   * @param executions - The function calls to execute
   * @param opts - The options
   * @returns
   */
  async createTxExecutionRequestWithWitness(
    executions: FunctionCall[],
    opts: CreateTxRequestOpts = {},
  ): Promise<{
    /** The transaction request */
    txRequest: TxExecutionRequest;
    /** The eip1271 witness */
    witness: Fr[];
    /** The message signed */
    message: Buffer;
  }> {
    if (opts.origin && !opts.origin.equals(this.address)) {
      throw new Error(`Sender ${opts.origin.toString()} does not match account address ${this.address.toString()}`);
    }

    const { payload, packedArguments: callsPackedArguments } = await buildPayload(executions);
    const message = await hashPayload(payload);
    const witness = await this.createEip1271Witness(message);

    const args = [payload];
    const abi = this.getEntrypointAbi();
    const packedArgs = await PackedArguments.fromArgs(encodeArguments(abi, args));
    const txRequest = TxExecutionRequest.from({
      argsHash: packedArgs.hash,
      origin: this.address,
      functionData: FunctionData.fromAbi(abi),
      txContext: TxContext.empty(this.chainId, this.version),
      packedArguments: [...callsPackedArguments, packedArgs],
    });

    return { txRequest, message, witness };
  }

  createTxExecutionRequest(executions: FunctionCall[], _opts: CreateTxRequestOpts = {}): Promise<TxExecutionRequest> {
    throw new Error(`Not implemented`);
  }

  private getEntrypointAbi() {
    // We use the SchnorrSingleKeyAccountContract because it implements the interface we need, but ideally
    // we should have an interface that defines the entrypoint for SingleKeyAccountContracts and
    // load the abi from it.
    const abi = (SchnorrEip1271AccountContractAbi as any as ContractAbi).functions.find(f => f.name === 'entrypoint');
    if (!abi) throw new Error(`Entrypoint abi for account contract not found`);
    return abi;
  }
}
