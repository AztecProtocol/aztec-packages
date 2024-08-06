
/**
 * The Validator Configuration
 */
export interface ValidatorClientConfig {
    /** The private key of the validator participating in attestation duties */
    validatorPrivateKey: string;
}

/**
 * Returns the validator configuration from the environment variables.
 * Note: If an environment variable is not set, the default value is used.
 * @returns Validator configuration
 */
export function getValidatorConfigFromEng(): ValidatorClientConfig {
    const {
        VALIDATOR_PRIVATE_KEY
    } = process.env;

    return {
        validatorPrivateKey: VALIDATOR_PRIVATE_KEY ?? ''
    };
}