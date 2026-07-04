export function createStringWriter(): {
  writer: { write(chunk: string): void };
  text(): string;
} {
  let output = "";

  return {
    writer: {
      write(chunk: string) {
        output += chunk;
      },
    },
    text() {
      return output;
    },
  };
}
