import { encodeArguments } from '@aztec/acir-simulator';
import { AztecRPC, generateFunctionSelector, Tx, TxHash } from '@aztec/aztec-rpc';
import { ARGS_LENGTH, AztecAddress, Fr, FunctionData, TxContext } from '@aztec/circuits.js';
import { FunctionType, FunctionAbi } from '@aztec/foundation/abi';
import { padArrayEnd } from '@aztec/foundation/collection';
import { ExecutionRequest, TxExecutionRequest } from '@aztec/types';
import partition from 'lodash.partition';
import times from 'lodash.times';
import { SentTx } from './sent_tx.js';

/**
 * Represents options for calling a (constrained) function in a contract.
 * Allows the user to specify the sender address and nonce for a transaction.
 */
export interface SendMethodOptions {
  /**
   * Sender's address initiating the transaction.
   */
  from?: AztecAddress;
  /**
   * The nonce representing the order of transactions sent by the address.
   */
  nonce?: Fr;
}

/**
 * Represents the options for a view method in a contract function interaction.
 * Allows specifying the address from which the view method should be called.
 */
export interface ViewMethodOptions {
  /**
   * The sender's Aztec address.
   */
  from?: AztecAddress;
}

/**
 * This is the class that is returned when calling e.g. `contract.methods.myMethod(arg0, arg1)`.
 * It contains available interactions one can call on a method.
 */
export class ContractFunctionInteraction {
  protected tx?: Tx;
  protected executionRequest?: ExecutionRequest;

  constructor(
    protected wallet: AztecRPC,
    protected contractAddress: AztecAddress,
    protected functionDao: FunctionAbi,
    protected args: any[],
  ) {}

  /**
   * Create an Aztec transaction instance by combining the transaction request and its signature.
   * This function will first check if a signature exists, and if not, it will call the `sign` method
   * to obtain the signature before creating the transaction. Throws an error if the function is
   * of unconstrained type or if the transaction request and signature are missing.
   *
   * @param options - An optional object containing additional configuration for the transaction.
   * @returns A Promise that resolves to a transaction instance.
   */
  public createTxRequest(options: SendMethodOptions = {}): ExecutionRequest {
    if (this.functionDao.functionType === FunctionType.UNCONSTRAINED) {
      throw new Error("Can't call `create` on an unconstrained function.");
    }

    this.executionRequest = this.#getExecutionRequest(this.contractAddress, options.from);
    // new Contract(LotteryABI) -- Contract Class
    // new Contract(LotteryABI).payWinnings() -- TxExecutionRequest
    //  ---------------------------------
    // new Contract(LotteryABI).payWinnings().simulate() -- Tx (Via RPC Server) -- need new method to simulate as contract
    // new Contract(LotteryABI).payWinnings().simulate().send() -- TxReceipt (Via RPC Server)

    // const call1 = new Contract(ERC20ABI).transfer() -- TxExecutionRequest
    // const walletCall = new Contract(WalletAbi).entryPoint().simulate();
    // const walletCall = new Contract(WalletAbi).entryPoint().simulate();

    return this.executionRequest;
  }

  #getExecutionRequest(to: AztecAddress, from?: AztecAddress): ExecutionRequest {
    const flatArgs = encodeArguments(this.functionDao, this.args);

    const functionData = new FunctionData(
      generateFunctionSelector(this.functionDao.name, this.functionDao.parameters),
      this.functionDao.functionType === FunctionType.SECRET,
      false,
    );

    return {
      args: flatArgs,
      functionData,
      to,
      from: from || AztecAddress.ZERO,
    };
  }

  /**
   * Sends a transaction to the contract function with the specified options.
   * This function throws an error if called on an unconstrained function.
   * It creates and signs the transaction if necessary, and returns a SentTx instance,
   * which can be used to track the transaction status, receipt, and events.
   *
   * @param options - An optional object containing 'from' property representing
   * the AztecAddress of the sender. If not provided, the default address is used.
   * @returns A SentTx instance for tracking the transaction status and information.
   */
  public send(options: SendMethodOptions = {}) {
    if (this.functionDao.functionType === FunctionType.UNCONSTRAINED) {
      throw new Error("Can't call `send` on an unconstrained function.");
    }

    let promise: Promise<TxHash>;
    if (this.tx) {
      promise = this.wallet.sendTx(this.tx);
    } else {
      promise = (async () => {
        const executions = [this.createTxRequest(options)];
        // TODO
        // this.checkIsNotDeployment(txContext);

        const [privateCalls, publicCalls] = partition(executions, exec => exec.functionData.isPrivate).map(execs =>
          execs.map(exec => ({
            args: exec.args,
            selector: exec.functionData.functionSelectorBuffer,
            target: exec.to,
          })),
        );

        const payload = buildPayload(privateCalls, publicCalls);

        const functionPayload = await this.authProvider.authenticateTx(payload, this.contractAddress);
        const txContext = TxContext.empty(await this.wallet.getNodeInfo(), await this.wallet.getVersion());
        const selector = generateFunctionSelector(this.functionDao.name, this.functionDao.parameters);
        const txRequest = TxExecutionRequest.from({
          args: functionPayload,
          origin: this.contractAddress,
          functionData: new FunctionData(selector, true, false),
          txContext,
        });

        const tx = await this.wallet.simulateTx(txRequest);
        return this.wallet.sendTx(tx);
      })();
    }

    return new SentTx(this.wallet, promise);
  }

  /**
   * Execute a view (read-only) transaction on an unconstrained function.
   * This method is used to call functions that do not modify the contract state and only return data.
   * Throws an error if called on a non-unconstrained function.
   *
   * @param options - An optional object containing additional configuration for the transaction.
   * @returns The result of the view transaction as returned by the contract function.
   */
  public view(options: ViewMethodOptions = {}) {
    if (this.functionDao.functionType !== FunctionType.UNCONSTRAINED) {
      throw new Error('Can only call `view` on an unconstrained function.');
    }

    const { from } = options;
    return this.wallet.viewTx(this.functionDao.name, this.args, this.contractAddress, from);
  }
}

const ACCOUNT_MAX_PRIVATE_CALLS = 1;
const ACCOUNT_MAX_PUBLIC_CALLS = 1;

/** A call to a function in a noir contract */
export type FunctionCall = {
  /** The encoded arguments */
  args: Fr[];
  /** The function selector */
  selector: Buffer;
  /** The address of the contract */
  target: AztecAddress;
};

/** Encoded payload for the account contract entrypoint */
export type EntrypointPayload = {
  // eslint-disable-next-line camelcase
  /** Concatenated arguments for every call */
  flattened_args: Fr[];
  // eslint-disable-next-line camelcase
  /** Concatenated selectors for every call */
  flattened_selectors: Fr[];
  // eslint-disable-next-line camelcase
  /** Concatenated target addresses for every call */
  flattened_targets: Fr[];
  /** A nonce for replay protection */
  nonce: Fr;
};

/** Assembles an entrypoint payload from a set of private and public function calls */
function buildPayload(privateCalls: FunctionCall[], publicCalls: FunctionCall[]): EntrypointPayload {
  const nonce = Fr.random();
  const emptyCall = { args: times(ARGS_LENGTH, Fr.zero), selector: Buffer.alloc(32), target: AztecAddress.ZERO };

  const calls = [
    ...padArrayEnd(privateCalls, emptyCall, ACCOUNT_MAX_PRIVATE_CALLS),
    ...padArrayEnd(publicCalls, emptyCall, ACCOUNT_MAX_PUBLIC_CALLS),
  ];

  return {
    // eslint-disable-next-line camelcase
    flattened_args: calls.flatMap(call => padArrayEnd(call.args, Fr.ZERO, ARGS_LENGTH)),
    // eslint-disable-next-line camelcase
    flattened_selectors: calls.map(call => Fr.fromBuffer(call.selector)),
    // eslint-disable-next-line camelcase
    flattened_targets: calls.map(call => call.target.toField()),
    nonce,
  };
}
