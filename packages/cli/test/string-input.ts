export function createStringInput(
  text: string,
): AsyncIterable<string | Uint8Array> {
  return {
    async *[Symbol.asyncIterator]() {
      yield text;
    },
  };
}
