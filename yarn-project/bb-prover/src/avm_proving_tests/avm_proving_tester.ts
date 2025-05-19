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
  generateAvmProofV2,
  verifyAvmProofV2,
} from '../bb/execute.js';

const BB_PATH = path.resolve('../../barretenberg/cpp/build/bin/bb');

export class AvmProvingTesterV2 extends PublicTxSimulationTester {
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
    return new AvmProvingTesterV2(bbWorkingDirectory, checkCircuitOnly, contractDataSource, merkleTrees, globals);
  }

  async proveV2(avmCircuitInputs: AvmCircuitInputs): Promise<BBResult> {
    // Then we prove.
    const proofRes = await generateAvmProofV2(
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

  async verifyV2(proofRes: BBSuccess, publicInputs: AvmCircuitPublicInputs): Promise<BBResult> {
    if (this.checkCircuitOnly) {
      // Skip verification if we are only checking the circuit.
      // Check-circuit does not generate a proof to verify.
      return proofRes;
    }

    return await verifyAvmProofV2(
      BB_PATH,
      this.bbWorkingDirectory,
      proofRes.proofPath!,
      publicInputs,
      path.join(proofRes.vkDirectoryPath!, VK_FILENAME),
      this.logger,
    );
  }

  public async proveVerifyV2(avmCircuitInputs: AvmCircuitInputs) {
    const provingRes = await this.proveV2(avmCircuitInputs);
    expect(provingRes.status).toEqual(BB_RESULT.SUCCESS);

    const verificationRes = await this.verifyV2(provingRes as BBSuccess, avmCircuitInputs.publicInputs);
    expect(verificationRes.status).toBe(BB_RESULT.SUCCESS);
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
    await this.proveVerifyV2(avmCircuitInputs);
  }

  public async simProveVerifyAppLogicV2(appCall: TestEnqueuedCall, expectRevert?: boolean) {
    await this.simProveVerifyV2(
      /*sender=*/ AztecAddress.fromNumber(42),
      /*setupCalls=*/ [],
      [appCall],
      undefined,
      expectRevert,
    );
  }
}
