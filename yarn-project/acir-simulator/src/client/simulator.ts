import { CallContext, CircuitsWasm, FunctionData, PrivateHistoricTreeRoots, TxContext } from '@aztec/circuits.js';
import { computeTxHash } from '@aztec/circuits.js/abis';
import { Grumpkin } from '@aztec/circuits.js/barretenberg';
import { ArrayType, FunctionAbi, FunctionType, encodeArguments } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { ExecutionRequest, TxExecutionRequest } from '@aztec/types';

import { PackedArgsCache } from '../packed_args_cache.js';
import { ClientTxExecutionContext } from './client_execution_context.js';
import { DBOracle } from './db_oracle.js';
import { ExecutionResult } from './execution_result.js';
import { computeNoteHashAndNullifierSelector, computeNoteHashAndNullifierSignature } from './function_selectors.js';
import { PrivateFunctionExecution } from './private_execution.js';
import { UnconstrainedFunctionExecution } from './unconstrained_execution.js';

/**
 * The ACIR simulator.
 */
export class AcirSimulator {
  private log: DebugLogger;

  constructor(private db: DBOracle) {
    this.log = createDebugLogger('aztec:simulator');
  }

  /**
   * Runs a private function.
   * @param request - The transaction request.
   * @param entryPointABI - The ABI of the entry point function.
   * @param contractAddress - The address of the contract (should match request.origin)
   * @param portalContractAddress - The address of the portal contract.
   * @param historicRoots - The historic roots.
   * @param curve - The curve instance for elliptic curve operations.
   * @param packedArguments - The entrypoint packed arguments
   * @returns The result of the execution.
   */
  public async run(
    request: TxExecutionRequest,
    entryPointABI: FunctionAbi,
    contractAddress: AztecAddress,
    portalContractAddress: EthAddress,
    historicRoots: PrivateHistoricTreeRoots,
  ): Promise<ExecutionResult> {
    if (entryPointABI.functionType !== FunctionType.SECRET) {
      throw new Error(`Cannot run ${entryPointABI.functionType} function as secret`);
    }

    if (request.origin !== contractAddress) {
      this.log(`WARN: Request origin does not match contract address in simulation`);
    }

    const curve = await Grumpkin.new();

    const callContext = new CallContext(
      AztecAddress.ZERO,
      contractAddress,
      portalContractAddress,
      false,
      false,
      request.functionData.isConstructor,
    );

    const wasm = await CircuitsWasm.get();
    const txNullifier = computeTxHash(wasm, request.toTxRequest());
    const execution = new PrivateFunctionExecution(
      new ClientTxExecutionContext(
        this.db,
        txNullifier,
        request.txContext,
        historicRoots,
        await PackedArgsCache.create(request.packedArguments),
      ),
      entryPointABI,
      contractAddress,
      request.functionData,
      request.argsHash,
      callContext,
      curve,
    );

    return execution.run();
  }

  /**
   * Runs an unconstrained function.
   * @param request - The transaction request.
   * @param entryPointABI - The ABI of the entry point function.
   * @param contractAddress - The address of the contract.
   * @param portalContractAddress - The address of the portal contract.
   * @param historicRoots - The historic roots.
   * @returns The return values of the function.
   */
  public async runUnconstrained(
    request: ExecutionRequest,
    entryPointABI: FunctionAbi,
    contractAddress: AztecAddress,
    portalContractAddress: EthAddress,
    historicRoots: PrivateHistoricTreeRoots,
  ) {
    if (entryPointABI.functionType !== FunctionType.UNCONSTRAINED) {
      throw new Error(`Cannot run ${entryPointABI.functionType} function as constrained`);
    }
    const callContext = new CallContext(
      request.from!,
      contractAddress,
      portalContractAddress,
      false,
      false,
      request.functionData.isConstructor,
    );

    const execution = new UnconstrainedFunctionExecution(
      new ClientTxExecutionContext(
        this.db,
        Fr.ZERO,
        TxContext.empty(),
        historicRoots,
        await PackedArgsCache.create([]),
      ),
      entryPointABI,
      contractAddress,
      request.functionData,
      request.args,
      callContext,
    );

    return execution.run();
  }

  /**
   * Computes the inner nullifier of a note.
   * @param contractAddress - The address of the contract.
   * @param nonce - The nonce of the note hash.
   * @param storageSlot - The storage slot.
   * @param notePreimage - The note preimage.
   * @returns The nullifier.
   */
  public async computeNoteHashAndNullifier(
    contractAddress: AztecAddress,
    nonce: Fr,
    storageSlot: Fr,
    notePreimage: Fr[],
  ) {
    try {
      const abi = await this.db.getFunctionABI(contractAddress, computeNoteHashAndNullifierSelector);

      const preimageLen = (abi.parameters[3].type as ArrayType).length;
      const extendedPreimage = notePreimage.concat(Array(preimageLen - notePreimage.length).fill(Fr.ZERO));

      const execRequest: ExecutionRequest = {
        from: AztecAddress.ZERO,
        to: AztecAddress.ZERO,
        functionData: FunctionData.empty(),
        args: encodeArguments(abi, [contractAddress, nonce, storageSlot, extendedPreimage]),
      };

      const [[innerNoteHash, uniqueNoteHash, siloedNoteHash, innerNullifier]] = await this.runUnconstrained(
        execRequest,
        abi,
        AztecAddress.ZERO,
        EthAddress.ZERO,
        PrivateHistoricTreeRoots.empty(),
      );

      return {
        innerNoteHash: new Fr(innerNoteHash),
        uniqueNoteHash: new Fr(uniqueNoteHash),
        siloedNoteHash: new Fr(siloedNoteHash),
        nullifier: new Fr(innerNullifier),
      };
    } catch (e) {
      throw new Error(
        `Please define an unconstrained function "${computeNoteHashAndNullifierSignature}" in the noir contract. Bubbled error message: ${e}`,
      );
    }
  }

  /**
   * Computes the inner note hash of a note, which contains storage slot and the custom note hash.
   * @param contractAddress - The address of the contract.
   * @param storageSlot - The storage slot.
   * @param notePreimage - The note preimage.
   * @param abi - The ABI of the function `compute_note_hash`.
   * @returns The note hash.
   */
  public async computeInnerNoteHash(contractAddress: AztecAddress, storageSlot: Fr, notePreimage: Fr[]) {
    const { innerNoteHash } = await this.computeNoteHashAndNullifier(
      contractAddress,
      Fr.ZERO,
      storageSlot,
      notePreimage,
    );
    return innerNoteHash;
  }

  /**
   * Computes the unique note hash of a note.
   * @param contractAddress - The address of the contract.
   * @param nonce - The nonce of the note hash.
   * @param storageSlot - The storage slot.
   * @param notePreimage - The note preimage.
   * @param abi - The ABI of the function `compute_note_hash`.
   * @returns The note hash.
   */
  public async computeUniqueNoteHash(contractAddress: AztecAddress, nonce: Fr, storageSlot: Fr, notePreimage: Fr[]) {
    const { uniqueNoteHash } = await this.computeNoteHashAndNullifier(
      contractAddress,
      nonce,
      storageSlot,
      notePreimage,
    );
    return uniqueNoteHash;
  }

  /**
   * Computes the siloed note hash of a note.
   * @param contractAddress - The address of the contract.
   * @param nonce - The nonce of the note hash.
   * @param storageSlot - The storage slot.
   * @param notePreimage - The note preimage.
   * @param abi - The ABI of the function `compute_note_hash`.
   * @returns The note hash.
   */
  public async computeSiloedNoteHash(contractAddress: AztecAddress, nonce: Fr, storageSlot: Fr, notePreimage: Fr[]) {
    const { siloedNoteHash } = await this.computeNoteHashAndNullifier(
      contractAddress,
      nonce,
      storageSlot,
      notePreimage,
    );
    return siloedNoteHash;
  }

  /**
   * Computes the inner note hash of a note, which contains storage slot and the custom note hash.
   * @param contractAddress - The address of the contract.
   * @param nonce - The nonce of the unique note hash.
   * @param storageSlot - The storage slot.
   * @param notePreimage - The note preimage.
   * @param abi - The ABI of the function `compute_note_hash`.
   * @returns The note hash.
   */
  public async computeNullifier(contractAddress: AztecAddress, nonce: Fr, storageSlot: Fr, notePreimage: Fr[]) {
    const { nullifier } = await this.computeNoteHashAndNullifier(contractAddress, nonce, storageSlot, notePreimage);
    return nullifier;
  }
}
