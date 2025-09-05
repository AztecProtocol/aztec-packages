import { EthAddress } from '@aztec/foundation/eth-address';
import { GSEAbi } from '@aztec/l1-artifacts/GSEAbi';

import type { ProjPointType } from '@noble/curves/abstract/weierstrass';
import { bn254 } from '@noble/curves/bn254';
import { type GetContractReturnType, type Hex, getContract } from 'viem';

import type { ViemClient } from '../types.js';

export type RegistrationTuple = {
  publicKeyInG1: {
    x: bigint;
    y: bigint;
  };
  publicKeyInG2: {
    x0: bigint;
    x1: bigint;
    y0: bigint;
    y1: bigint;
  };
  proofOfPossession: {
    x: bigint;
    y: bigint;
  };
};

export class GSEContract {
  public address: EthAddress;
  private readonly gse: GetContractReturnType<typeof GSEAbi, ViemClient>;

  constructor(
    public readonly client: ViemClient,
    address: Hex | EthAddress,
  ) {
    if (address instanceof EthAddress) {
      address = address.toString();
    }
    this.address = EthAddress.fromString(address);
    this.gse = getContract({ address, abi: GSEAbi, client });
  }

  public async getOwner(): Promise<EthAddress> {
    return EthAddress.fromString(await this.gse.read.owner());
  }

  public async getGovernance(): Promise<EthAddress> {
    return EthAddress.fromString(await this.gse.read.getGovernance());
  }

  getAttestersFromIndicesAtTime(instance: Hex | EthAddress, ts: bigint, indices: bigint[]) {
    if (instance instanceof EthAddress) {
      instance = instance.toString();
    }
    return this.gse.read.getAttestersFromIndicesAtTime([instance, ts, indices]);
  }

  public async getRegistrationDigest(publicKey: ProjPointType<bigint>): Promise<ProjPointType<bigint>> {
    const affinePublicKey = publicKey.toAffine();
    const g1PointDigest = await this.gse.read.getRegistrationDigest([{ x: affinePublicKey.x, y: affinePublicKey.y }]);
    return bn254.G1.ProjectivePoint.fromAffine(g1PointDigest);
  }

  public async makeRegistrationTuple(privateKey: bigint): Promise<RegistrationTuple> {
    const publicKeyG1 = bn254.G1.ProjectivePoint.BASE.multiply(privateKey);
    const digest = await this.getRegistrationDigest(publicKeyG1);
    const signature = digest.multiply(privateKey);
    const publicKeyG2 = bn254.G2.ProjectivePoint.BASE.multiply(privateKey);
    const publicKeyG1Affine = publicKeyG1.toAffine();
    const signatureAffine = signature.toAffine();
    const publicKeyG2Affine = publicKeyG2.toAffine();
    return {
      publicKeyInG1: {
        x: publicKeyG1Affine.x,
        y: publicKeyG1Affine.y,
      },
      publicKeyInG2: {
        x0: publicKeyG2Affine.x.c0,
        x1: publicKeyG2Affine.x.c1,
        y0: publicKeyG2Affine.y.c0,
        y1: publicKeyG2Affine.y.c1,
      },
      proofOfPossession: {
        x: signatureAffine.x,
        y: signatureAffine.y,
      },
    };
  }
}
