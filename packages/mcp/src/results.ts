import { StarfetchError, type ResolvedTapTarget } from "@starfetch-js/core";

export type ToolResult<
  TStructuredContent extends Record<string, unknown> = Record<string, unknown>,
> = {
  content: [{ type: "text"; text: string }];
  isError?: true;
  structuredContent?: TStructuredContent;
};

export async function runTool<
  TStructuredContent extends Record<string, unknown>,
>(
  callback: () => Promise<ToolResult<TStructuredContent>>,
): Promise<ToolResult<TStructuredContent>> {
  try {
    return await callback();
  } catch (error) {
    return toolError(error);
  }
}

export function success<TData, TDiagnostics extends Record<string, unknown>>(
  data: TData,
  diagnostics: TDiagnostics,
): ToolResult<{ data: TData; diagnostics: TDiagnostics }> {
  const structuredContent = { data, diagnostics };

  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}

export function targetDiagnostics(
  target: ResolvedTapTarget,
): Pick<ResolvedTapTarget, "baseUrl" | "label" | "service"> {
  const diagnostics: Pick<ResolvedTapTarget, "baseUrl" | "label" | "service"> =
    {
      baseUrl: target.baseUrl,
    };

  if (target.label !== undefined) {
    diagnostics.label = target.label;
  }

  if (target.service !== undefined) {
    diagnostics.service = target.service;
  }

  return diagnostics;
}

function toolError<TStructuredContent extends Record<string, unknown>>(
  error: unknown,
): ToolResult<TStructuredContent> {
  const message = formatToolError(error);

  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

function formatToolError(error: unknown): string {
  if (error instanceof StarfetchError) {
    return `${error.name}: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
