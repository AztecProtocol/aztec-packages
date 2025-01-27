import cKzg from 'c-kzg';

/* eslint-disable import/no-named-as-default-member */
const { loadTrustedSetup } = cKzg;

export * from './blob.js';
export * from './mocks.js';
export * from './encoding.js';
export * from './interface.js';

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
