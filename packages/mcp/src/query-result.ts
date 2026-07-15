import {
  formatTapResult,
  type TapOutputFormat,
  type TapResult,
  type TapResultField,
} from "@starfetch-js/core";

export type TapQueryData = {
  content: string;
  format: TapOutputFormat;
  fields?: TapResultField[];
  overflow?: boolean;
};

export async function createTapQueryData(
  result: TapResult,
  format: TapOutputFormat,
): Promise<TapQueryData> {
  if (format !== "json" && format !== "jsonl") {
    return { content: await formatTapResult(result, format), format };
  }

  const [content, fields, overflow] = await Promise.all([
    formatTapResult(result, format),
    result.fields(),
    result.overflow(),
  ]);

  return {
    content,
    fields,
    format,
    ...(overflow === undefined ? {} : { overflow }),
  };
}
