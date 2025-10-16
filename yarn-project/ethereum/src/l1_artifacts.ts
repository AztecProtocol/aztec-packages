import {
  CoinIssuerAbi,
  CoinIssuerBytecode,
  DateGatedRelayerAbi,
  DateGatedRelayerBytecode,
  EmpireSlasherDeploymentExtLibAbi,
  EmpireSlasherDeploymentExtLibBytecode,
  EmpireSlashingProposerAbi,
  EmpireSlashingProposerBytecode,
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
  RewardDeploymentExtLibAbi,
  RewardDeploymentExtLibBytecode,
  RewardDistributorAbi,
  RewardDistributorBytecode,
  RollupAbi,
  RollupBytecode,
  RollupLinkReferences,
  RollupOperationsExtLibAbi,
  RollupOperationsExtLibBytecode,
  SlashFactoryAbi,
  SlashFactoryBytecode,
  SlasherAbi,
  SlasherBytecode,
  StakingAssetHandlerAbi,
  StakingAssetHandlerBytecode,
  TallySlasherDeploymentExtLibAbi,
  TallySlasherDeploymentExtLibBytecode,
  TallySlashingProposerAbi,
  TallySlashingProposerBytecode,
  TestERC20Abi,
  TestERC20Bytecode,
  ValidatorOperationsExtLibAbi,
  ValidatorOperationsExtLibBytecode,
  ValidatorSelectionLibAbi,
  ValidatorSelectionLibBytecode,
} from '@aztec/l1-artifacts';

import type { Hex } from 'viem';

export const RegistryArtifact = {
  name: 'Registry',
  contractAbi: RegistryAbi,
  contractBytecode: RegistryBytecode as Hex,
};

export const InboxArtifact = {
  name: 'Inbox',
  contractAbi: InboxAbi,
  contractBytecode: InboxBytecode as Hex,
};

export const OutboxArtifact = {
  name: 'Outbox',
  contractAbi: OutboxAbi,
  contractBytecode: OutboxBytecode as Hex,
};

export const RollupArtifact = {
  name: 'Rollup',
  contractAbi: RollupAbi,
  contractBytecode: RollupBytecode as Hex,
  libraries: {
    linkReferences: RollupLinkReferences,
    libraryCode: {
      ValidatorSelectionLib: {
        name: 'ValidatorSelectionLib',
        contractAbi: ValidatorSelectionLibAbi,
        contractBytecode: ValidatorSelectionLibBytecode as Hex,
      },
      RollupOperationsExtLib: {
        name: 'RollupOperationsExtLib',
        contractAbi: RollupOperationsExtLibAbi,
        contractBytecode: RollupOperationsExtLibBytecode as Hex,
      },
      ValidatorOperationsExtLib: {
        name: 'ValidatorOperationsExtLib',
        contractAbi: ValidatorOperationsExtLibAbi,
        contractBytecode: ValidatorOperationsExtLibBytecode as Hex,
      },
      RewardDeploymentExtLib: {
        name: 'RewardDeploymentExtLib',
        contractAbi: RewardDeploymentExtLibAbi,
        contractBytecode: RewardDeploymentExtLibBytecode as Hex,
      },
      TallySlasherDeploymentExtLib: {
        name: 'TallySlasherDeploymentExtLib',
        contractAbi: TallySlasherDeploymentExtLibAbi,
        contractBytecode: TallySlasherDeploymentExtLibBytecode as Hex,
      },
      EmpireSlasherDeploymentExtLib: {
        name: 'EmpireSlasherDeploymentExtLib',
        contractAbi: EmpireSlasherDeploymentExtLibAbi,
        contractBytecode: EmpireSlasherDeploymentExtLibBytecode as Hex,
      },
    },
  },
};

export const StakingAssetArtifact = {
  name: 'StakingAsset',
  contractAbi: TestERC20Abi,
  contractBytecode: TestERC20Bytecode as Hex,
};

export const FeeAssetArtifact = {
  name: 'FeeAsset',
  contractAbi: TestERC20Abi,
  contractBytecode: TestERC20Bytecode as Hex,
};

export const FeeJuicePortalArtifact = {
  name: 'FeeJuicePortal',
  contractAbi: FeeJuicePortalAbi,
  contractBytecode: FeeJuicePortalBytecode as Hex,
};

export const RewardDistributorArtifact = {
  name: 'RewardDistributor',
  contractAbi: RewardDistributorAbi,
  contractBytecode: RewardDistributorBytecode as Hex,
};

export const CoinIssuerArtifact = {
  name: 'CoinIssuer',
  contractAbi: CoinIssuerAbi,
  contractBytecode: CoinIssuerBytecode as Hex,
};

export const DateGatedRelayerArtifact = {
  name: 'DateGatedRelayer',
  contractAbi: DateGatedRelayerAbi,
  contractBytecode: DateGatedRelayerBytecode as Hex,
};

export const GovernanceProposerArtifact = {
  name: 'GovernanceProposer',
  contractAbi: GovernanceProposerAbi,
  contractBytecode: GovernanceProposerBytecode as Hex,
};

export const GovernanceArtifact = {
  name: 'Governance',
  contractAbi: GovernanceAbi,
  contractBytecode: GovernanceBytecode as Hex,
};

export const SlasherArtifact = {
  name: 'Slasher',
  contractAbi: SlasherAbi,
  contractBytecode: SlasherBytecode as Hex,
};

export const EmpireSlashingProposerArtifact = {
  name: 'EmpireSlashingProposer',
  contractAbi: EmpireSlashingProposerAbi,
  contractBytecode: EmpireSlashingProposerBytecode as Hex,
};

export const TallySlashingProposerArtifact = {
  name: 'TallySlashingProposer',
  contractAbi: TallySlashingProposerAbi,
  contractBytecode: TallySlashingProposerBytecode as Hex,
};

export const SlashFactoryArtifact = {
  name: 'SlashFactory',
  contractAbi: SlashFactoryAbi,
  contractBytecode: SlashFactoryBytecode as Hex,
};

export const RegisterNewRollupVersionPayloadArtifact = {
  name: 'RegisterNewRollupVersionPayload',
  contractAbi: RegisterNewRollupVersionPayloadAbi,
  contractBytecode: RegisterNewRollupVersionPayloadBytecode as Hex,
};

export const FeeAssetHandlerArtifact = {
  name: 'FeeAssetHandler',
  contractAbi: FeeAssetHandlerAbi,
  contractBytecode: FeeAssetHandlerBytecode as Hex,
};

export const StakingAssetHandlerArtifact = {
  name: 'StakingAssetHandler',
  contractAbi: StakingAssetHandlerAbi,
  contractBytecode: StakingAssetHandlerBytecode as Hex,
};

export const MultiAdderArtifact = {
  name: 'MultiAdder',
  contractAbi: MultiAdderAbi,
  contractBytecode: MultiAdderBytecode as Hex,
};

export const GSEArtifact = {
  name: 'GSE',
  contractAbi: GSEAbi,
  contractBytecode: GSEBytecode as Hex,
};

// Verifier artifacts
export const HonkVerifierArtifact = {
  name: 'HonkVerifier',
  contractAbi: HonkVerifierAbi,
  contractBytecode: HonkVerifierBytecode as Hex,
};

export const MockVerifierArtifact = {
  name: 'MockVerifier',
  contractAbi: MockVerifierAbi,
  contractBytecode: MockVerifierBytecode as Hex,
};

export const MockZkPassportVerifierArtifact = {
  name: 'MockZkPassportVerifier',
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
