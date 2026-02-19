export {
  type ValidatorHASignerConfig,
  ValidatorHASignerConfigSchema,
  defaultValidatorHASignerConfig,
  getConfigEnvVars,
  validatorHASignerConfigMappings,
} from './config.js';
export {
  DutyType,
  type BlockProposalSigningContext,
  type HAProtectedSigningContext,
  type NoHAProtectionSigningContext,
  type OtherSigningContext,
  type SigningContext,
  type VoteSigningContext,
  getBlockNumberFromSigningContext,
  isHAProtectedContext,
} from './types.js';
