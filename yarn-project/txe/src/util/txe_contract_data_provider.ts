import { type ContractArtifact, Fr } from '@aztec/aztec.js';
import { ContractDataProvider } from '@aztec/pxe/server';

export type ContractArtifactWithHash = ContractArtifact & { artifactHash: Fr };

/*
 * A contract data provider that stores contract artifacts with their hashes. Since
 * TXE typically deploys the same contract again and again for multiple tests, caching
 * the *very* expensive artifact hash computation improves testing speed significantly.
 */
export class TXEContractDataProvider extends ContractDataProvider {
  #artifactHashes: Map<string, Buffer> = new Map();

  public override async addContractArtifact(
    id: Fr,
    artifact: ContractArtifact | ContractArtifactWithHash,
  ): Promise<void> {
    if ('artifactHash' in artifact) {
      this.#artifactHashes.set(id.toString(), artifact.artifactHash.toBuffer());
    }
    await super.addContractArtifact(id, artifact);
  }

  public override async getContractArtifact(
    contractClassId: Fr,
  ): Promise<ContractArtifact | ContractArtifactWithHash | undefined> {
    const artifact = await super.getContractArtifact(contractClassId);
    if (artifact && this.#artifactHashes.has(contractClassId.toString())) {
      (artifact as ContractArtifactWithHash).artifactHash = Fr.fromBuffer(
        this.#artifactHashes.get(contractClassId.toString())!,
      );
    }
    return artifact;
  }
}
