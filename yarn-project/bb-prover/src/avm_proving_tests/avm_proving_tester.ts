import {
  PublicTxSimulationTester,
  SimpleContractDataSource,
  type TestEnqueuedCall,
} from '@aztec/simulator/public/fixtures';
import { type AvmCircuitInputs, AvmCircuitPublicInputs } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import type { GlobalVariables } from '@aztec/stdlib/tx';
import { NativeWorldStateService } from '@aztec/world-state';

import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'path';

import {
  type BBResult,
  type BBSuccess,
  BB_RESULT,
  VK_FILENAME,
  generateAvmProof,
  verifyAvmProof,
} from '../bb/execute.js';

const BB_PATH = path.resolve('../../barretenberg/cpp/build/bin/bb');

export class AvmProvingTester extends PublicTxSimulationTester {
  constructor(
    private bbWorkingDirectory: string,
    private checkCircuitOnly: boolean,
    contractDataSource: SimpleContractDataSource,
    merkleTrees: MerkleTreeWriteOperations,
    globals?: GlobalVariables,
  ) {
    super(merkleTrees, contractDataSource, globals);
  }

  static async new(checkCircuitOnly: boolean = false, globals?: GlobalVariables) {
    const bbWorkingDirectory = await fs.mkdtemp(path.join(tmpdir(), 'bb-'));

    const contractDataSource = new SimpleContractDataSource();
    const merkleTrees = await (await NativeWorldStateService.tmp()).fork();
    return new AvmProvingTester(bbWorkingDirectory, checkCircuitOnly, contractDataSource, merkleTrees, globals);
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
    expect(proofRes.status).toEqual(BB_RESULT.SUCCESS);
    return proofRes as BBSuccess;
  }

  async verify(proofRes: BBSuccess, publicInputs: AvmCircuitPublicInputs): Promise<BBResult> {
    if (this.checkCircuitOnly) {
      // Skip verification if we are only checking the circuit.
      // Check-circuit does not generate a proof to verify.
      return proofRes;
    }

    return await verifyAvmProof(
      BB_PATH,
      this.bbWorkingDirectory,
      proofRes.proofPath!,
      publicInputs,
      path.join(proofRes.vkDirectoryPath!, VK_FILENAME),
      this.logger,
    );
  }

  public async proveVerify(avmCircuitInputs: AvmCircuitInputs) {
    const provingRes = await this.prove(avmCircuitInputs);
    expect(provingRes.status).toEqual(BB_RESULT.SUCCESS);

    const verificationRes = await this.verify(provingRes as BBSuccess, avmCircuitInputs.publicInputs);
    expect(verificationRes.status).toBe(BB_RESULT.SUCCESS);
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
    await this.proveVerify(avmCircuitInputs);
  }

  public async simProveVerifyAppLogic(appCall: TestEnqueuedCall, expectRevert?: boolean) {
    await this.simProveVerify(
      /*sender=*/ AztecAddress.fromNumber(42),
      /*setupCalls=*/ [],
      [appCall],
      undefined,
      expectRevert,
    );
  }
}
