export type OutputWriter = {
  write(chunk: string): unknown;
};

export type InputReader = AsyncIterable<string | Uint8Array> & {
  isTTY?: boolean;
};

export type RunCliOptions = {
  stdout?: OutputWriter;
  stderr?: OutputWriter;
  stdin?: InputReader;
  fetch?: typeof fetch;
  cwd?: string;
  homeDir?: string;
};
