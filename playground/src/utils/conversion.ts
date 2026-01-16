export const formatFrAsString = (addressAsString: string, sliceLength: number = 4) => {
  return `${addressAsString.slice(0, sliceLength + 2)}...${addressAsString.slice(-sliceLength)}`;
};

export const parseAliasedBuffersAsString = (aliasedBuffers: { alias: string; item: string }[]) => {
  return aliasedBuffers.map(({ alias, item }) => ({
    alias,
    item: convertFromUTF8BufferAsString(item),
  }));
};

export const convertFromUTF8BufferAsString = (bufferAsString: string) => {
  return bufferAsString
    .split(',')
    .map(x => String.fromCharCode(+x))
    .join('');
};
