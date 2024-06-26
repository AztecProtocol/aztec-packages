import { type AppCircuitProofOutput, type KernelProofOutput, type ProofCreator } from '@aztec/circuit-types';
import { type CircuitProvingStats, type CircuitWitnessGenerationStats } from '@aztec/circuit-types/stats';
import {
  AGGREGATION_OBJECT_LENGTH,
  Fr,
  NESTED_RECURSIVE_PROOF_LENGTH,
  type PrivateCircuitPublicInputs,
  type PrivateKernelCircuitPublicInputs,
  type PrivateKernelInitCircuitPrivateInputs,
  type PrivateKernelInnerCircuitPrivateInputs,
  type PrivateKernelResetCircuitPrivateInputsVariants,
  type PrivateKernelTailCircuitPrivateInputs,
  type PrivateKernelTailCircuitPublicInputs,
  Proof,
  RECURSIVE_PROOF_LENGTH,
  RecursiveProof,
  type VerificationKeyAsFields,
  type VerificationKeyData,
  ClientIvcProof,
} from '@aztec/circuits.js';
import { siloNoteHash } from '@aztec/circuits.js/hash';
import { runInDirectory } from '@aztec/foundation/fs';
import { createDebugLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import {
  ClientCircuitArtifacts,
  type ClientProtocolArtifact,
  PrivateResetTagToArtifactName,
  convertPrivateKernelInitInputsToWitnessMap,
  convertPrivateKernelInitOutputsFromWitnessMap,
  convertPrivateKernelInnerInputsToWitnessMap,
  convertPrivateKernelInnerOutputsFromWitnessMap,
  convertPrivateKernelResetInputsToWitnessMap,
  convertPrivateKernelResetOutputsFromWitnessMap,
  convertPrivateKernelTailForPublicOutputsFromWitnessMap,
  convertPrivateKernelTailInputsToWitnessMap,
  convertPrivateKernelTailOutputsFromWitnessMap,
  convertPrivateKernelTailToPublicInputsToWitnessMap,
} from '@aztec/noir-protocol-circuits-types';
import { WASMSimulator } from '@aztec/simulator';
import { type NoirCompiledCircuit } from '@aztec/types/noir';
import { serializeWitness } from '@noir-lang/noirc_abi';
import { type WitnessMap } from '@noir-lang/types';
import * as fs from 'fs/promises';
import { encode } from "@msgpack/msgpack";

import {
  BB_RESULT,
  PROOF_FIELDS_FILENAME,
  PROOF_FILENAME,
  generateKeyForNoirCircuit,
  generateProof,
  verifyProof,
  executeBbClientIvcProof,
} from '../bb/execute.js';
import { mapProtocolArtifactNameToCircuitName } from '../stats.js';
import { extractVkData } from '../verification_key/verification_key_data.js';
import path from 'path';

/**
 * This proof creator implementation uses the native bb binary.
 * This is a temporary implementation until we make the WASM version work.
 */
export class BBNativeProofCreator implements ProofCreator {
  private simulator = new WASMSimulator();

  private verificationKeys: Map<ClientProtocolArtifact, Promise<VerificationKeyData>> = new Map<
    ClientProtocolArtifact,
    Promise<VerificationKeyData>
  >();

  constructor(
    private bbBinaryPath: string,
    private bbWorkingDirectory: string,
    private log = createDebugLogger('aztec:bb-native-prover'),
  ) { }

  private async _createClientIvcProof(
    directory: string,
    acirs: Buffer[],
    witnessStack: WitnessMap[],
  ): Promise<ClientIvcProof> {
    // LONDONTODO(AD): Longer term we won't use this hacked together msgpack format
    // and instead properly create the bincode serialization from rust
    await fs.writeFile(path.join(directory, "acir.msgpack"), encode(acirs));
    await fs.writeFile(path.join(directory, "witnesses.msgpack"), encode(witnessStack.map((map) => serializeWitness(map))));
    const provingResult = await executeBbClientIvcProof(
      this.bbBinaryPath,
      directory,
      path.join(directory, "acir.msgpack"),
      path.join(directory, "witnesses.msgpack"),
      this.log.info
    );

    if (provingResult.status === BB_RESULT.FAILURE) {
      this.log.error(`Failed to generate client ivc proof`);
      throw new Error(provingResult.reason);
    }

    const proof = await ClientIvcProof.readFromOutputDirectory(directory);

    this.log.info(`Generated IVC proof`, {
      duration: provingResult.duration,
      eventName: 'circuit-proving',
    });

    return proof; // LONDONTODO(Client): What is this vk now?
  }

  async createClientIvcProof(acirs: Buffer[], witnessStack: WitnessMap[]): Promise<ClientIvcProof> {
    this.log.info(
      `Generating Client IVC proof`,
    );
    const operation = async (directory: string) => {
      return await this._createClientIvcProof(directory, acirs, witnessStack);
    };
    return await runInDirectory(this.bbWorkingDirectory, operation);
  }

  public getSiloedCommitments(publicInputs: PrivateCircuitPublicInputs) {
    const contractAddress = publicInputs.callContext.storageContractAddress;

    return Promise.resolve(
      publicInputs.newNoteHashes.map(commitment => siloNoteHash(contractAddress, commitment.value)),
    );
  }

  public async createProofInit(
    inputs: PrivateKernelInitCircuitPrivateInputs,
  ): Promise<KernelProofOutput<PrivateKernelCircuitPublicInputs>> {
    return await this.createSafeProof(
      inputs,
      'PrivateKernelInitArtifact',
      convertPrivateKernelInitInputsToWitnessMap,
      convertPrivateKernelInitOutputsFromWitnessMap,
    );
  }

  public async createProofInner(
    inputs: PrivateKernelInnerCircuitPrivateInputs,
  ): Promise<KernelProofOutput<PrivateKernelCircuitPublicInputs>> {
    return await this.createSafeProof(
      inputs,
      'PrivateKernelInnerArtifact',
      convertPrivateKernelInnerInputsToWitnessMap,
      convertPrivateKernelInnerOutputsFromWitnessMap,
    );
  }

  public async createProofReset(
    inputs: PrivateKernelResetCircuitPrivateInputsVariants,
  ): Promise<KernelProofOutput<PrivateKernelCircuitPublicInputs>> {
    return await this.createSafeProof(
      inputs,
      PrivateResetTagToArtifactName[inputs.sizeTag],
      convertPrivateKernelResetInputsToWitnessMap,
      output => convertPrivateKernelResetOutputsFromWitnessMap(output, inputs.sizeTag),
    );
  }

  public async createProofTail(
    inputs: PrivateKernelTailCircuitPrivateInputs,
  ): Promise<KernelProofOutput<PrivateKernelTailCircuitPublicInputs>> {
    if (!inputs.isForPublic()) {
      return await this.createSafeProof(
        inputs,
        'PrivateKernelTailArtifact',
        convertPrivateKernelTailInputsToWitnessMap,
        convertPrivateKernelTailOutputsFromWitnessMap,
      );
    }
    return await this.createSafeProof(
      inputs,
      'PrivateKernelTailToPublicArtifact',
      convertPrivateKernelTailToPublicInputsToWitnessMap,
      convertPrivateKernelTailForPublicOutputsFromWitnessMap,
    );
  }

  // LONDONTODO(Client): This is the first proof created
  public async createAppCircuitProof(
    partialWitness: WitnessMap, // from simulation
    bytecode: Buffer,
    appCircuitName?: string,
  ): Promise<AppCircuitProofOutput> {
    const operation = async (directory: string) => {
      this.log.debug(`Proving app circuit`);
      const proofOutput = await this.createProof(directory, partialWitness, bytecode, 'App', appCircuitName);
      // LONDONTODO(Client): what's a recursive proof and why should this be one?
      if (proofOutput.proof.proof.length != RECURSIVE_PROOF_LENGTH) {
        throw new Error(`Incorrect proof length`);
      }
      const proof = proofOutput.proof;
      const output: AppCircuitProofOutput = {
        proof,
        verificationKey: proofOutput.verificationKey,
      };
      return output;
    };

    return await runInDirectory(this.bbWorkingDirectory, operation);
  }

  /**
   * Verifies a proof, will generate the verification key if one is not cached internally
   * @param circuitType - The type of circuit whose proof is to be verified
   * @param proof - The proof to be verified
   */
  public async verifyProofForProtocolCircuit(circuitType: ClientProtocolArtifact, proof: Proof) {
    const verificationKey = await this.getVerificationKeyDataForCircuit(circuitType);

    this.log.debug(`Verifying with key: ${verificationKey.keyAsFields.hash.toString()}`);

    const logFunction = (message: string) => {
      this.log.debug(`${circuitType} BB out - ${message}`);
    };

    const result = await this.verifyProofFromKey(verificationKey.keyAsBytes, proof, logFunction);

    if (result.status === BB_RESULT.FAILURE) {
      const errorMessage = `Failed to verify ${circuitType} proof!`;
      throw new Error(errorMessage);
    }

    this.log.info(`Successfully verified ${circuitType} proof in ${result.duration} ms`);
  }

  private async verifyProofFromKey(
    verificationKey: Buffer,
    proof: Proof,
    logFunction: (message: string) => void = () => { },
  ) {
    const operation = async (bbWorkingDirectory: string) => {
      const proofFileName = `${bbWorkingDirectory}/proof`;
      const verificationKeyPath = `${bbWorkingDirectory}/vk`;

      await fs.writeFile(proofFileName, proof.buffer);
      await fs.writeFile(verificationKeyPath, verificationKey);
      return await verifyProof(this.bbBinaryPath, proofFileName, verificationKeyPath!, logFunction);
    };
    return await runInDirectory(this.bbWorkingDirectory, operation);
  }

  /**
   * Returns the verification key data for a circuit, will generate and cache it if not cached internally
   * @param circuitType - The type of circuit for which the verification key is required
   * @returns The verification key data
   */
  private async getVerificationKeyDataForCircuit(circuitType: ClientProtocolArtifact): Promise<VerificationKeyData> {
    let promise = this.verificationKeys.get(circuitType);
    if (!promise) {
      promise = generateKeyForNoirCircuit(
        this.bbBinaryPath,
        this.bbWorkingDirectory,
        circuitType,
        ClientCircuitArtifacts[circuitType],
        'vk',
        this.log.debug,
      ).then(result => {
        if (result.status === BB_RESULT.FAILURE) {
          throw new Error(`Failed to generate verification key for ${circuitType}, ${result.reason}`);
        }
        return extractVkData(result.vkPath!);
      });
      this.verificationKeys.set(circuitType, promise);
    }
    return await promise;
  }

  /**
   * Ensures our verification key cache includes the key data located at the specified directory
   * @param filePath - The directory containing the verification key data files
   * @param circuitType - The type of circuit to which the verification key corresponds
   */
  private async updateVerificationKeyAfterProof(filePath: string, circuitType: ClientProtocolArtifact) {
    let promise = this.verificationKeys.get(circuitType);
    if (!promise) {
      promise = extractVkData(filePath);
      this.log.debug(`Updated verification key for circuit: ${circuitType}`);
      this.verificationKeys.set(circuitType, promise);
    }
    return await promise;
  }

  private async createSafeProof<I extends { toBuffer: () => Buffer }, O extends { toBuffer: () => Buffer }>(
    inputs: I,
    circuitType: ClientProtocolArtifact,
    convertInputs: (inputs: I) => WitnessMap,
    convertOutputs: (outputs: WitnessMap) => O,
  ): Promise<KernelProofOutput<O>> {
    const operation = async (directory: string) => {
      return await this.generateWitnessAndCreateProof(inputs, circuitType, directory, convertInputs, convertOutputs);
    };
    return await runInDirectory(this.bbWorkingDirectory, operation);
  }

  private async generateWitnessAndCreateProof<
    I extends { toBuffer: () => Buffer },
    O extends { toBuffer: () => Buffer },
    >(
      inputs: I,
      circuitType: ClientProtocolArtifact,
      directory: string,
      convertInputs: (inputs: I) => WitnessMap,
      convertOutputs: (outputs: WitnessMap) => O,
  ): Promise<KernelProofOutput<O>> {
    this.log.debug(`Generating witness for ${circuitType}`);
    // LONDONTODO(Client): This compiled circuit now needs to have a #fold appended
    // LONDONTODO(Client): Question: you can separately compile circuits to be folded and then send, right?
    const compiledCircuit: NoirCompiledCircuit = ClientCircuitArtifacts[circuitType];

    const witnessMap = convertInputs(inputs);
    const timer = new Timer();
    const outputWitness = await this.simulator.simulateCircuit(witnessMap, compiledCircuit);
    const output = convertOutputs(outputWitness);

    this.log.debug(`Generated witness for ${circuitType}`, {
      eventName: 'circuit-witness-generation',
      circuitName: mapProtocolArtifactNameToCircuitName(circuitType),
      duration: timer.ms(),
      inputSize: inputs.toBuffer().length,
      outputSize: output.toBuffer().length,
    } satisfies CircuitWitnessGenerationStats);

    // LONDONTODO(Client): This should just output the vk right? Consider refactor later (vk already supplied...?) but for now just re-use the function (possibly with rename?)?
    const proofOutput = await this.createProof(
      directory,
      outputWitness,
      Buffer.from(compiledCircuit.bytecode, 'base64'),
      circuitType,
    );
    this.log.debug(`proof length: ${proofOutput.proof.proof.length}`);
    if (proofOutput.proof.proof.length != NESTED_RECURSIVE_PROOF_LENGTH) {
      throw new Error(`Incorrect proof length`);
    }
    // LONDONTODO(Client): this goes away from kernelOutput
    const nestedProof = proofOutput.proof as RecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH>;
    const kernelOutput: KernelProofOutput<O> = {
      publicInputs: output,
      proof: nestedProof,
      verificationKey: proofOutput.verificationKey,
      outputWitness
    };
    return kernelOutput;
  }

  private async createProof(
    directory: string,
    partialWitness: WitnessMap,
    bytecode: Buffer,
    circuitType: ClientProtocolArtifact | 'App',
    appCircuitName?: string,
  ): Promise<{
    proof: RecursiveProof<typeof RECURSIVE_PROOF_LENGTH> | RecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH>;
    verificationKey: VerificationKeyAsFields;
  }> {
    const compressedBincodedWitness = serializeWitness(partialWitness);

    const inputsWitnessFile = `${directory}/witness.gz`;

    await fs.writeFile(inputsWitnessFile, compressedBincodedWitness); // FOLDINGSTACK: witness is written to a file here

    // // LONDONTODO(FoldingStack): Every circuit processed by full.test passes through this method during proof construction. Here I'm just writing the
    // // acir data (acir bytecode + witness) to a test fixtures file in bberg. (This should be all that's needed to construct corresponding bberg circuits).
    // // Hoping this provides a quick way to start playing around with accumulation. Probably easiest to start in the integration tests suite. That's where
    // // I'll plan to pick up tomorrow unless something else makes more sense by the time I get back to it. Once things are working there we can work to
    // // fill in the real pieces, e.g. better organization/serialization of this data, a proper flow in the bb binary (which is maybe just the existing
    // // flow if we end up serializing into a WitnessStack). One issue is going to be that the kernel circuits will have recursive verifiers. Might be easy
    // // enough to just 'delete' those op codes from the acir representation, but might also make sense to have versions of the kernels without recursion
    // // since we'll need them soon enough anyway.
    // let fixturesDir = path.resolve(this.bbBinaryPath, '../../../../', 'e2e_fixtures/folding_stack');
    // // Get circuit name; replace colons with underscores
    // const circuitName = (appCircuitName ? appCircuitName : circuitType).replace(/:/g, '_');
    // const stackItemDir = path.join(fixturesDir, circuitName);
    // await fs.mkdir(stackItemDir, { recursive: true });
    // // Write the acir bytecode and witness data to file
    // const bytecodePath = `${stackItemDir}/bytecode`;
    // const witnessPath = `${stackItemDir}/witness.gz`;
    // this.log.info(`Writing data for ${circuitName} to ${fixturesDir}`);
    // await fs.writeFile(bytecodePath, bytecode);
    // await fs.writeFile(witnessPath, compressedBincodedWitness); // FOLDINGSTACK: witness is written to a file here

    this.log.debug(`Written ${inputsWitnessFile}`);

    this.log.info(`Proving ${circuitType} circuit...`);

    const timer = new Timer();

    const provingResult = await generateProof(
      this.bbBinaryPath,
      directory,
      circuitType,
      bytecode,
      inputsWitnessFile,
      this.log.debug,
    );

    if (provingResult.status === BB_RESULT.FAILURE) {
      this.log.error(`Failed to generate proof for ${circuitType}: ${provingResult.reason}`);
      throw new Error(provingResult.reason);
    }

    this.log.info(
      `Generated ${circuitType === 'App' ? appCircuitName : circuitType} circuit proof in ${timer.ms()} ms`,
    );

    if (circuitType === 'App') {
      const vkData = await extractVkData(directory);
      const proof = await this.readProofAsFields<typeof RECURSIVE_PROOF_LENGTH>(directory, circuitType, vkData);

      this.log.info(`Generated proof`, {
        eventName: 'circuit-proving',
        circuitName: 'app-circuit',
        duration: provingResult.duration,
        inputSize: compressedBincodedWitness.length,
        proofSize: proof.binaryProof.buffer.length,
        appCircuitName,
        circuitSize: vkData.circuitSize,
        numPublicInputs: vkData.numPublicInputs,
      } as CircuitProvingStats);

      // WORKTODO: push stuff to the stack for folding

      return { proof, verificationKey: vkData.keyAsFields };
    }

    const vkData = await this.updateVerificationKeyAfterProof(directory, circuitType);

    const proof = await this.readProofAsFields<typeof NESTED_RECURSIVE_PROOF_LENGTH>(directory, circuitType, vkData);

    await this.verifyProofForProtocolCircuit(circuitType, proof.binaryProof);

    this.log.debug(`Generated proof`, {
      circuitName: mapProtocolArtifactNameToCircuitName(circuitType),
      duration: provingResult.duration,
      eventName: 'circuit-proving',
      inputSize: compressedBincodedWitness.length,
      proofSize: proof.binaryProof.buffer.length,
      circuitSize: vkData.circuitSize,
      numPublicInputs: vkData.numPublicInputs,
    } as CircuitProvingStats);

    return { proof, verificationKey: vkData.keyAsFields };
  }

  /**
   * Parses and returns the proof data stored at the specified directory
   * @param filePath - The directory containing the proof data
   * @param circuitType - The type of circuit proven
   * @returns The proof
   */
  private async readProofAsFields<PROOF_LENGTH extends number>(
    filePath: string,
    circuitType: ClientProtocolArtifact | 'App',
    vkData: VerificationKeyData,
  ): Promise<RecursiveProof<PROOF_LENGTH>> {
    const [binaryProof, proofString] = await Promise.all([
      fs.readFile(`${filePath}/${PROOF_FILENAME}`),
      fs.readFile(`${filePath}/${PROOF_FIELDS_FILENAME}`, { encoding: 'utf-8' }),
    ]);
    // LONDONTODO we want to parse out the right bytes from proof
    const json = JSON.parse(proofString);
    const fields = json.map(Fr.fromString);
    const numPublicInputs = vkData.numPublicInputs;
    // const numPublicInputs =
    //   circuitType === 'App' ? vkData.numPublicInputs : vkData.numPublicInputs - AGGREGATION_OBJECT_LENGTH;
    const fieldsWithoutPublicInputs = fields.slice(numPublicInputs);
    this.log.info(
      `Circuit type: ${circuitType}, complete proof length: ${fields.length}, without public inputs: ${fieldsWithoutPublicInputs.length}, num public inputs: ${numPublicInputs}, circuit size: ${vkData.circuitSize}, is recursive: ${vkData.isRecursive}, raw length: ${binaryProof.length}`,
    );
    const proof = new RecursiveProof<PROOF_LENGTH>(
      fieldsWithoutPublicInputs,
      new Proof(binaryProof, vkData.numPublicInputs),
      true,
    );
    return proof;
  }
}
