import { AztecAddress, CircuitsWasm, FunctionData, PartialContractAddress, TxContext } from '@aztec/circuits.js';
import { Signer } from '@aztec/circuits.js/barretenberg';
import { ContractAbi, encodeArguments, generateFunctionSelector } from '@aztec/foundation/abi';
import { ExecutionRequest, PackedArguments, TxExecutionRequest } from '@aztec/types';

import partition from 'lodash.partition';

import SchnorrAccountContractAbi from '../abis/schnorr_account_contract.json' assert { type: 'json' };
import { generatePublicKey } from '../index.js';
import { buildPayload, hashPayload } from './entrypoint_payload.js';
import { AccountImplementation } from './index.js';

/**
 * Account contract implementation that uses a single key for signing and encryption. This public key is not
 * stored in the contract, but rather verified against the contract address. Note that this approach is not
 * secure and should not be used in real use cases.
 */
export class SingleKeyAccountContract implements AccountImplementation {
  constructor(
    private address: AztecAddress,
    private partialContractAddress: PartialContractAddress,
    private privateKey: Buffer,
    private signer: Signer,
  ) {}

  getAddress(): AztecAddress {
    return this.address;
  }

  async createAuthenticatedTxRequest(
    executions: ExecutionRequest[],
    txContext: TxContext,
  ): Promise<TxExecutionRequest> {
    this.checkSender(executions);
    this.checkIsNotDeployment(txContext);

    const [privateCalls, publicCalls] = partition(executions, exec => exec.functionData.isPrivate);
    const wasm = await CircuitsWasm.get();
    const { payload, packedArguments: callsPackedArguments } = await buildPayload(privateCalls, publicCalls);
    const hash = hashPayload(payload);

    const signature = this.signer.constructSignature(hash, this.privateKey).toBuffer();
    const publicKey = await generatePublicKey(this.privateKey);
    const args = [payload, publicKey.toBuffer(), signature, this.partialContractAddress];
    const abi = this.getEntrypointAbi();
    const selector = generateFunctionSelector(abi.name, abi.parameters);
    const packedArgs = await PackedArguments.fromArgs(encodeArguments(abi, args), wasm);
    const txRequest = TxExecutionRequest.from({
      argsHash: packedArgs.hash,
      origin: this.address,
      functionData: new FunctionData(selector, true, false),
      txContext,
      packedArguments: [...callsPackedArguments, packedArgs],
    });

    return txRequest;
  }

  private getEntrypointAbi() {
    // We use the SchnorrAccountContract because it implements the interface we need, but ideally
    // we should have an interface that defines the entrypoint for SingleKeyAccountContracts and
    // load the abi from it.
    const abi = (SchnorrAccountContractAbi as any as ContractAbi).functions.find(f => f.name === 'entrypoint');
    if (!abi) throw new Error(`Entrypoint abi for account contract not found`);
    return abi;
  }

  private checkIsNotDeployment(txContext: TxContext) {
    if (txContext.isContractDeploymentTx) {
      throw new Error(`Cannot yet deploy contracts from an account contract`);
    }
  }

  private checkSender(executions: ExecutionRequest[]) {
    const wrongSender = executions.find(e => !e.from.equals(this.address));
    if (wrongSender) {
      throw new Error(
        `Sender ${wrongSender.from.toString()} does not match account address ${this.address.toString()}`,
      );
    }
  }
}
