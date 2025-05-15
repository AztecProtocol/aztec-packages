import {
  PublicTxSimulationTester,
  SimpleContractDataSource,
  type TestEnqueuedCall,
} from '@aztec/simulator/public/fixtures';
import { type AvmCircuitInputs, AvmCircuitPublicInputs } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import type { GlobalVariables } from '@aztec/stdlib/tx';
import { VerificationKeyData } from '@aztec/stdlib/vks';
import { NativeWorldStateService } from '@aztec/world-state';

import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'path';

import {
  type BBResult,
  type BBSuccess,
  BB_RESULT,
  generateAvmProof,
  generateAvmProofV2,
  verifyAvmProof,
  verifyAvmProofV2,
} from '../bb/execute.js';
import { extractAvmVkData } from '../verification_key/verification_key_data.js';

const BB_PATH = path.resolve('../../barretenberg/cpp/build/bin/bb');

export class AvmProvingTester extends PublicTxSimulationTester {
  constructor(
    private bbWorkingDirectory: string,
    private checkCircuitOnly: boolean,
    merkleTree: MerkleTreeWriteOperations,
    contractDataSource: SimpleContractDataSource,
    globals?: GlobalVariables,
  ) {
    super(merkleTree, contractDataSource, globals);
  }

  // overriding parent class' create is a pain, so we use a different nam
  static async new(checkCircuitOnly: boolean = false, globals?: GlobalVariables) {
    const bbWorkingDirectory = await fs.mkdtemp(path.join(tmpdir(), 'bb-'));

    const contractDataSource = new SimpleContractDataSource();
    const merkleTrees = await (await NativeWorldStateService.tmp()).fork();
    return new AvmProvingTester(bbWorkingDirectory, checkCircuitOnly, merkleTrees, contractDataSource, globals);
  }

  async prove(avmCircuitInputs: AvmCircuitInputs): Promise<BBResult> {
    // Then we prove.
    const proofRes = await generateAvmProof(
      BB_PATH,
      this.bbWorkingDirectory,
      avmCircuitInputs,
      this.logger,
      this.checkCircuitOnly,
    );
    if (proofRes.status === BB_RESULT.FAILURE) {
      this.logger.error(`Proof generation failed: ${proofRes.reason}`);
    }
    return proofRes;
  }

  async verify(proofRes: BBSuccess): Promise<BBResult> {
    if (this.checkCircuitOnly) {
      // Skip verification if we're only checking the circuit.
      // Check-circuit doesn't generate a proof to verify.
      return proofRes;
    }
    // Then we test VK extraction and serialization.
    const succeededRes = proofRes as BBSuccess;
    const vkData = await extractAvmVkData(succeededRes.vkPath!);
    VerificationKeyData.fromBuffer(vkData.toBuffer());

    // Then we verify.
    const rawVkPath = path.join(succeededRes.vkPath!, 'vk');
    return await verifyAvmProof(BB_PATH, succeededRes.proofPath!, rawVkPath, this.logger);
  }

  public async simProveVerify(
    sender: AztecAddress,
    setupCalls: TestEnqueuedCall[],
    appCalls: TestEnqueuedCall[],
    teardownCall: TestEnqueuedCall | undefined,
    expectRevert: boolean | undefined,
    feePayer = sender,
  ) {
    const simRes = await this.simulateTx(sender, setupCalls, appCalls, teardownCall, feePayer);
    expect(simRes.revertCode.isOK()).toBe(expectRevert ? false : true);
    const avmCircuitInputs = simRes.avmProvingRequest.inputs;
    const provingRes = await this.prove(avmCircuitInputs);
    expect(provingRes.status).toEqual(BB_RESULT.SUCCESS);
    const verificationRes = await this.verify(provingRes as BBSuccess);
    expect(verificationRes.status).toBe(BB_RESULT.SUCCESS);
  }

  public async simProveVerifyAppLogic(appCall: TestEnqueuedCall, expectRevert?: boolean) {
    const simRes = await this.simulateTx(/*sender=*/ AztecAddress.fromNumber(42), /*setupCalls=*/ [], [appCall]);
    expect(simRes.revertCode.isOK()).toBe(expectRevert ? false : true);

    const avmCircuitInputs = simRes.avmProvingRequest.inputs;
    const provingRes = await this.prove(avmCircuitInputs);
    expect(provingRes.status).toEqual(BB_RESULT.SUCCESS);

    const verificationRes = await this.verify(provingRes as BBSuccess);
    expect(verificationRes.status).toBe(BB_RESULT.SUCCESS);
  }
}

export class AvmProvingTesterV2 extends PublicTxSimulationTester {
  constructor(
    private bbWorkingDirectory: string,
    contractDataSource: SimpleContractDataSource,
    merkleTrees: MerkleTreeWriteOperations,
    globals?: GlobalVariables,
  ) {
    super(merkleTrees, contractDataSource, globals);
  }

  static async new(globals?: GlobalVariables) {
    const bbWorkingDirectory = await fs.mkdtemp(path.join(tmpdir(), 'bb-'));

    const contractDataSource = new SimpleContractDataSource();
    const merkleTrees = await (await NativeWorldStateService.tmp()).fork();
    return new AvmProvingTesterV2(bbWorkingDirectory, contractDataSource, merkleTrees, globals);
  }

  async proveV2(avmCircuitInputs: AvmCircuitInputs): Promise<BBResult> {
    // Then we prove.
    const proofRes = await generateAvmProofV2(BB_PATH, this.bbWorkingDirectory, avmCircuitInputs, this.logger);
    if (proofRes.status === BB_RESULT.FAILURE) {
      this.logger.error(`Proof generation failed: ${proofRes.reason}`);
    }
    expect(proofRes.status).toEqual(BB_RESULT.SUCCESS);
    return proofRes as BBSuccess;
  }

  async verifyV2(proofRes: BBSuccess, publicInputs: AvmCircuitPublicInputs): Promise<BBResult> {
    return await verifyAvmProofV2(
      BB_PATH,
      this.bbWorkingDirectory,
      proofRes.proofPath!,
      publicInputs,
      proofRes.vkPath!,
      this.logger,
    );
  }

  public async simProveVerifyV2(
    sender: AztecAddress,
    setupCalls: TestEnqueuedCall[],
    appCalls: TestEnqueuedCall[],
    teardownCall: TestEnqueuedCall | undefined,
    expectRevert: boolean | undefined,
    feePayer = sender,
  ) {
    const simRes = await this.simulateTx(sender, setupCalls, appCalls, teardownCall, feePayer);
    expect(simRes.revertCode.isOK()).toBe(expectRevert ? false : true);

    const avmCircuitInputs = simRes.avmProvingRequest.inputs;
    const provingRes = await this.proveV2(avmCircuitInputs);
    expect(provingRes.status).toEqual(BB_RESULT.SUCCESS);

    const verificationRes = await this.verifyV2(provingRes as BBSuccess, avmCircuitInputs.publicInputs);
    expect(verificationRes.status).toBe(BB_RESULT.SUCCESS);
  }
}
