/**
 * TypeScript type declarations for non-code imports
 */

// Allow importing JSON files
declare module '*.json' {
  const value: any;
  export default value;
}
