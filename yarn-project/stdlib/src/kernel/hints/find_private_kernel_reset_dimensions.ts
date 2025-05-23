import {
  PrivateKernelResetDimensions,
  type PrivateKernelResetDimensionsConfig,
  privateKernelResetDimensionNames,
} from '../private_kernel_reset_dimensions.js';

interface DimensionOption {
  dimensions: PrivateKernelResetDimensions;
  cost: number;
  remainder?: PrivateKernelResetDimensions;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function computeCost(dimensions: PrivateKernelResetDimensions, config: PrivateKernelResetDimensionsConfig) {
  return privateKernelResetDimensionNames.reduce(
    (accum, name) => accum + dimensions[name] * config.dimensions[name].cost,
    0,
  );
}

function getSize(dimensions: PrivateKernelResetDimensions) {
  return privateKernelResetDimensionNames.reduce((accum, name) => accum + dimensions[name], 0);
}

function getRemainder(
  requestedDimensions: PrivateKernelResetDimensions,
  foundDimensions: PrivateKernelResetDimensions,
) {
  const remainder = PrivateKernelResetDimensions.empty();
  let remainingDimensions = 0;
  privateKernelResetDimensionNames.forEach(name => {
    if (requestedDimensions[name] > foundDimensions[name]) {
      remainingDimensions++;
      remainder[name] = requestedDimensions[name] - foundDimensions[name];
    }
  });
  return remainingDimensions ? remainder : undefined;
}

function pickFromValues(targetValue: number, values: number[]) {
  // Find the min value in `values` that's greater than or equal to `targetValue`.
  const minGte = values.reduce(
    (prev: number | undefined, curr) => (curr >= targetValue && (prev === undefined || curr < prev) ? curr : prev),
    undefined,
  );

  // If no such value is found, returns the max value.
  return minGte ?? Math.max(...values);
}

function pickCheapest(options: DimensionOption[]) {
  return options.reduce((prev, curr) => (curr.cost < prev.cost ? curr : prev), options[0]);
}

function pickSmallestRemainder(options: DimensionOption[]) {
  const optionsWithSize = options
    .filter(o => o.remainder)
    .map(option => ({ option, size: getSize(option.remainder!) }));
  return optionsWithSize.reduce((prev, curr) => (curr.size < prev.size ? curr : prev), optionsWithSize[0])?.option;
}

function pickBestOption(options: DimensionOption[]) {
  const optionsResetAll = options.filter(opt => !opt.remainder);
  const optionsResetPartial = options.filter(opt => opt.remainder);
  // The best option is the cheapest one that can reset all dimensions.
  // If no such option exists, find one that can reset the most data.
  return pickCheapest(optionsResetAll) || pickSmallestRemainder(optionsResetPartial);
}

function findVariant(
  requestedDimensions: PrivateKernelResetDimensions,
  config: PrivateKernelResetDimensionsConfig,
  isQualified: (dimensions: PrivateKernelResetDimensions) => boolean,
): DimensionOption | undefined {
  const variant = PrivateKernelResetDimensions.empty();
  privateKernelResetDimensionNames.forEach(name => {
    variant[name] = pickFromValues(requestedDimensions[name], config.dimensions[name].variants);
  });
  if (!isQualified(variant)) {
    return;
  }

  return {
    dimensions: variant,
    cost: computeCost(variant, config),
    remainder: getRemainder(requestedDimensions, variant),
  };
}

function findStandalone(
  requestedDimensions: PrivateKernelResetDimensions,
  config: PrivateKernelResetDimensionsConfig,
  isQualified: (dimensions: PrivateKernelResetDimensions) => boolean,
): DimensionOption | undefined {
  const needsReset = privateKernelResetDimensionNames.filter(name => requestedDimensions[name] > 0);
  if (needsReset.length !== 1) {
    // At the moment, we only use standalone to reset one dimension when it's about to overflow.
    return;
  }

  const name = needsReset[0];
  const value = pickFromValues(requestedDimensions[name], config.dimensions[name].standalone);
  if (!value) {
    return;
  }

  const dimensions = PrivateKernelResetDimensions.from({ [name]: value });
  if (!isQualified(dimensions)) {
    return;
  }

  return {
    dimensions,
    cost: computeCost(dimensions, config),
    remainder: getRemainder(requestedDimensions, dimensions),
  };
}

function findSpecialCase(
  requestedDimensions: PrivateKernelResetDimensions,
  config: PrivateKernelResetDimensionsConfig,
  isQualified: (dimensions: PrivateKernelResetDimensions) => boolean,
): DimensionOption | undefined {
  const specialCases = config.specialCases.map(PrivateKernelResetDimensions.fromValues);
  const options = specialCases.filter(isQualified).map(dimensions => ({
    dimensions,
    cost: computeCost(dimensions, config),
    remainder: getRemainder(requestedDimensions, dimensions),
  }));
  return pickBestOption(options);
}

export function findPrivateKernelResetDimensions(
  requestedDimensions: PrivateKernelResetDimensions,
  config: PrivateKernelResetDimensionsConfig,
  isInner = false,
  allowRemainder = false,
) {
  const requestedValues = requestedDimensions.toValues();
  const isEnough = allowRemainder
    ? () => true
    : (dimensions: PrivateKernelResetDimensions) => dimensions.toValues().every((v, i) => v >= requestedValues[i]);

  const isQualified = !isInner
    ? isEnough
    : // If isInner is true, it's a reset to prevent overflow. The following must be zero because siloing can't be done at the moment.
      (dimensions: PrivateKernelResetDimensions) =>
        dimensions.NOTE_HASH_SILOING === 0 &&
        dimensions.NULLIFIER_SILOING === 0 &&
        dimensions.PRIVATE_LOG_SILOING === 0 &&
        isEnough(dimensions);

  const options = [
    findVariant(requestedDimensions, config, isQualified),
    findStandalone(requestedDimensions, config, isQualified),
    findSpecialCase(requestedDimensions, config, isQualified),
  ].filter(isDefined);

  if (!options.length) {
    throw new Error(`Cannot find an option for dimension: ${requestedDimensions.toValues()}`);
  }

  return pickBestOption(options).dimensions;
}
