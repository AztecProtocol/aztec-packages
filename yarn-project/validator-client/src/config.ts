
/**
 * The Validator Configuration
 */
export interface ValidatorClientConfig {
    /** The private key of the validator participating in attestation duties */
    validatorPrivateKey: string;

    /** Do not run the validator */
    disableValidator: boolean;
}

/**
 * Returns the validator configuration from the environment variables.
 * Note: If an environment variable is not set, the default value is used.
 * @returns Validator configuration
 */
export function getValidatorConfigFromEnv(): ValidatorClientConfig {
    const {
        VALIDATOR_PRIVATE_KEY,
        DISABLE_VALIDATOR
    } = process.env;

    return {
        validatorPrivateKey: VALIDATOR_PRIVATE_KEY ?? '',
        disableValidator: DISABLE_VALIDATOR ? true : false
    };
}