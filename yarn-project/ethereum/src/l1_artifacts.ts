import {
  CoinIssuerAbi,
  CoinIssuerBytecode,
  ExtRollupLib2Abi,
  ExtRollupLib2Bytecode,
  ExtRollupLibAbi,
  ExtRollupLibBytecode,
  FeeAssetHandlerAbi,
  FeeAssetHandlerBytecode,
  FeeJuicePortalAbi,
  FeeJuicePortalBytecode,
  GSEAbi,
  GSEBytecode,
  GovernanceAbi,
  GovernanceBytecode,
  GovernanceProposerAbi,
  GovernanceProposerBytecode,
  HonkVerifierAbi,
  HonkVerifierBytecode,
  InboxAbi,
  InboxBytecode,
  MockVerifierAbi,
  MockVerifierBytecode,
  MockZKPassportVerifierAbi,
  MockZKPassportVerifierBytecode,
  MultiAdderAbi,
  MultiAdderBytecode,
  OutboxAbi,
  OutboxBytecode,
  RegisterNewRollupVersionPayloadAbi,
  RegisterNewRollupVersionPayloadBytecode,
  RegistryAbi,
  RegistryBytecode,
  RewardDistributorAbi,
  RewardDistributorBytecode,
  RollupAbi,
  RollupBytecode,
  RollupLinkReferences,
  SlashFactoryAbi,
  SlashFactoryBytecode,
  StakingAssetHandlerAbi,
  StakingAssetHandlerBytecode,
  TestERC20Abi,
  TestERC20Bytecode,
  ValidatorSelectionLibAbi,
  ValidatorSelectionLibBytecode,
} from '@aztec/l1-artifacts';

import type { Hex } from 'viem';

export const RegistryArtifact = {
  contractAbi: RegistryAbi,
  contractBytecode: RegistryBytecode as Hex,
};

export const InboxArtifact = {
  contractAbi: InboxAbi,
  contractBytecode: InboxBytecode as Hex,
};

export const OutboxArtifact = {
  contractAbi: OutboxAbi,
  contractBytecode: OutboxBytecode as Hex,
};

export const RollupArtifact = {
  contractAbi: RollupAbi,
  contractBytecode: RollupBytecode as Hex,
  libraries: {
    linkReferences: RollupLinkReferences,
    libraryCode: {
      ValidatorSelectionLib: {
        contractAbi: ValidatorSelectionLibAbi,
        contractBytecode: ValidatorSelectionLibBytecode as Hex,
      },
      ExtRollupLib: {
        contractAbi: ExtRollupLibAbi,
        contractBytecode: ExtRollupLibBytecode as Hex,
      },
      ExtRollupLib2: {
        contractAbi: ExtRollupLib2Abi,
        contractBytecode: ExtRollupLib2Bytecode as Hex,
      },
    },
  },
};

export const StakingAssetArtifact = {
  contractAbi: TestERC20Abi,
  contractBytecode: TestERC20Bytecode as Hex,
};

export const FeeAssetArtifact = {
  contractAbi: TestERC20Abi,
  contractBytecode: TestERC20Bytecode as Hex,
};

export const FeeJuicePortalArtifact = {
  contractAbi: FeeJuicePortalAbi,
  contractBytecode: FeeJuicePortalBytecode as Hex,
};

export const RewardDistributorArtifact = {
  contractAbi: RewardDistributorAbi,
  contractBytecode: RewardDistributorBytecode as Hex,
};

export const CoinIssuerArtifact = {
  contractAbi: CoinIssuerAbi,
  contractBytecode: CoinIssuerBytecode as Hex,
};

export const GovernanceProposerArtifact = {
  contractAbi: GovernanceProposerAbi,
  contractBytecode: GovernanceProposerBytecode as Hex,
};

export const GovernanceArtifact = {
  contractAbi: GovernanceAbi,
  contractBytecode: GovernanceBytecode as Hex,
};

export const SlashFactoryArtifact = {
  contractAbi: SlashFactoryAbi,
  contractBytecode: SlashFactoryBytecode as Hex,
};

export const RegisterNewRollupVersionPayloadArtifact = {
  contractAbi: RegisterNewRollupVersionPayloadAbi,
  contractBytecode: RegisterNewRollupVersionPayloadBytecode as Hex,
};

export const FeeAssetHandlerArtifact = {
  contractAbi: FeeAssetHandlerAbi,
  contractBytecode: FeeAssetHandlerBytecode as Hex,
};

export const StakingAssetHandlerArtifact = {
  contractAbi: StakingAssetHandlerAbi,
  contractBytecode: StakingAssetHandlerBytecode as Hex,
};

export const MultiAdderArtifact = {
  contractAbi: MultiAdderAbi,
  contractBytecode: MultiAdderBytecode as Hex,
};

export const GSEArtifact = {
  contractAbi: GSEAbi,
  contractBytecode: GSEBytecode as Hex,
};

// Verifier artifacts
export const HonkVerifierArtifact = {
  contractAbi: HonkVerifierAbi,
  contractBytecode: HonkVerifierBytecode as Hex,
};

export const MockVerifierArtifact = {
  contractAbi: MockVerifierAbi,
  contractBytecode: MockVerifierBytecode as Hex,
};

export const MockZkPassportVerifierArtifact = {
  contractAbi: MockZKPassportVerifierAbi,
  contractBytecode: MockZKPassportVerifierBytecode as Hex,
};

// Re-export the verifier artifacts for backwards compatibility
export const l1ArtifactsVerifiers = {
  honkVerifier: HonkVerifierArtifact,
};

// Re-export the mock verifiers for backwards compatibility
export const mockVerifiers = {
  mockVerifier: MockVerifierArtifact,
  mockZkPassportVerifier: MockZkPassportVerifierArtifact,
};
