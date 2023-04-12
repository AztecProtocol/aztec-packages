import { ExecutionResult } from '@aztec/acir-simulator';
import {
  OldTreeRoots,
  PrivateKernelPublicInputs,
  TxRequest,
  CircuitsWasm,
  SignedTxRequest,
  PrivateCallData,
  PRIVATE_CALL_STACK_LENGTH,
  PrivateCallStackItem,
  PreviousKernelData,
  UInt8Vector,
  EcdsaSignature,
  MembershipWitness,
  CONTRACT_TREE_HEIGHT,
  privateKernelSim,
  FUNCTION_TREE_HEIGHT,
  VerificationKey,
  makeEmptyProof,
  NewContractData,
  DummyPreviousKernelData,
} from '@aztec/circuits.js';
import { computeContractLeaf } from '@aztec/circuits.js/abis';
import { createDebugLogger, Fr } from '@aztec/foundation';

/**
 * Represents the function tree information for a private call stack item.
 * Contains the root of the function tree and a membership witness, which is necessary
 * for proving the execution of a private contract function in Aztec's zero-knowledge proof system.
 */
export interface FunctionTreeInfo {
  /**
   * Root of the contract's function tree.
   */
  root: Fr;
  /**
   * A Merkle tree membership proof for the function tree.
   */
  membershipWitness: MembershipWitness<typeof FUNCTION_TREE_HEIGHT>;
}

/**
 * The KernelProver class is responsible for generating zk-SNARK proofs in the Aztec network.
 * It takes a transaction request, signature, execution result, and other related data, then simulates
 * the private kernel to generate the necessary public inputs for proof generation. The class also allows
 * for skipping the actual proof generation during development, returning an empty proof instead.
 * This class plays an essential role in ensuring privacy and security in the Aztec network.
 */
export class KernelProver {
  constructor(private log = createDebugLogger('aztec:kernel_prover')) {}
  /**
   * Generate a proof for a given transaction request and related data.
   * This function simulates the private kernel execution, constructs public inputs, and creates a proof by invoking the zk-SNARK prover.
   * The resulting proof can be used to verify the validity of the transaction in a zero-knowledge manner, ensuring privacy and correctness.
   *
   * @param txRequest - The transaction request containing necessary input data.
   * @param txSignature - The ECDSA signature of the transaction request.
   * @param executionResult - The result of executing the requested function in the AztecACIR simulator.
   * @param oldRoots - An object containing the old tree roots required for verifying the proof.
   * @param getFunctionTreeInfo - A callback function that takes a PrivateCallStackItem and returns a Promise resolving to FunctionTreeInfo.
   * @param getContractSiblingPath - A callback function that takes a committment Buffer and returns a Promise resolving to a MembershipWitness for the contract tree.
   * @returns A Promise that resolves to an object containing the public inputs and proof for the transaction.
   */
  async prove(
    txRequest: TxRequest,
    txSignature: EcdsaSignature,
    executionResult: ExecutionResult,
    oldRoots: OldTreeRoots,
    getFunctionTreeInfo: (callStackItem: PrivateCallStackItem) => Promise<FunctionTreeInfo>,
    getContractSiblingPath: (committment: Buffer) => Promise<MembershipWitness<typeof CONTRACT_TREE_HEIGHT>>,
  ): Promise<{
    /**
     * The public inputs required for the kernel proof verification.
     */
    publicInputs: PrivateKernelPublicInputs;
    /**
     * The zk-SNARK proof generated for the private kernel execution.
     */
    proof: Buffer;
  }> {
    const wasm = await CircuitsWasm.get();
    // TODO: implement this
    const signedTxRequest = new SignedTxRequest(txRequest, txSignature);

    const functionTreeInfo = await getFunctionTreeInfo(executionResult.callStackItem);
    const newContractData = new NewContractData(
      executionResult.callStackItem.publicInputs.callContext.storageContractAddress,
      executionResult.callStackItem.publicInputs.callContext.portalContractAddress,
      functionTreeInfo.root,
    );
    const committment = computeContractLeaf(wasm, newContractData);
    const contractLeafMembershipWitness = txRequest.functionData.isConstructor
      ? this.createRandomMembershipWitness()
      : await getContractSiblingPath(committment.toBuffer());

    const privateCallData = new PrivateCallData(
      executionResult.callStackItem,
      Array(PRIVATE_CALL_STACK_LENGTH)
        .fill(0)
        .map(() => PrivateCallStackItem.empty()),
      new UInt8Vector(Buffer.alloc(42)),
      VerificationKey.fromBuffer(executionResult.vk),
      functionTreeInfo.membershipWitness,
      contractLeafMembershipWitness,
      txRequest.txContext.contractDeploymentData.portalContractAddress,
    );

    const previousKernelData: PreviousKernelData = await DummyPreviousKernelData.getDummyPreviousKernelData(wasm);

    this.log(`Executing private kernel simulation...`);
    const publicInputs = await privateKernelSim(wasm, signedTxRequest, previousKernelData, privateCallData);
    this.log(`Skipping private kernel proving...`);
    // const proof = await privateKernelProve(wasm, signedTxRequest, previousKernelData, privateCallData);
    const proof = makeEmptyProof().buffer;
    this.log('Kernel Prover Completed!');

    return Promise.resolve({
      publicInputs,
      proof,
    });
  }

  /**
   * Create a dummy VerificationKey instance for testing purposes.
   * This function generates a fake verification key which can be used in scenarios where
   * the actual verification key is not required, such as skipping the private kernel proving.
   *
   * @returns A fake VerificationKey instance.
   */
  private createDummyVk() {
    return VerificationKey.makeFake();
  }

  /**
   * Create a random membership witness for the contract tree.
   * This function generates a membership witness of CONTRACT_TREE_HEIGHT with random Fr elements as siblings path.
   * Useful for simulating witness data when constructing a new contract leaf.
   *
   * @returns A MembershipWitness instance with random Fr siblings path and corresponding tree height.
   */
  private createRandomMembershipWitness() {
    return new MembershipWitness<typeof CONTRACT_TREE_HEIGHT>(
      CONTRACT_TREE_HEIGHT,
      0,
      Array(CONTRACT_TREE_HEIGHT)
        .fill(0)
        .map(() => Fr.random()),
    );
  }
}
