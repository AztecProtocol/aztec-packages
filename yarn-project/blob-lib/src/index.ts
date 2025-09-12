import cKzg from 'c-kzg';

const { loadTrustedSetup } = cKzg;

export * from './blob.js';
export * from './blob_batching.js';
export * from './encoding.js';
export * from './interface.js';
export * from './errors.js';
export * from './blob_batching_public_inputs.js';
export * from './sponge_blob.js';

try {
  loadTrustedSetup();
} catch (error: any) {
  if (error.message.includes('trusted setup is already loaded')) {
    // NB: The c-kzg lib has no way of checking whether the setup is loaded or not,
    // and it throws an error if it's already loaded, even though nothing is wrong.
    // This is a rudimentary way of ensuring we load the trusted setup if we need it.
  } else {
    throw new Error(error);
  }
}
