export const formatFrAsString = (addressAsString: string, sliceLength: number = 4) => {
  return `${addressAsString.slice(0, sliceLength + 2)}...${addressAsString.slice(-sliceLength)}`;
};

export const parseAliasedBuffersAsString = (aliasedBuffers: { key: string; value: string }[]) => {
  return aliasedBuffers
    .filter(account => account.key !== 'accounts:last')
    .map(({ key, value }) => ({
      key,
      value: convertFromUTF8BufferAsString(value),
    }));
};

export const convertFromUTF8BufferAsString = (bufferAsString: string) => {
  return bufferAsString
    .split(',')
    .map(x => String.fromCharCode(+x))
    .join('');
};
