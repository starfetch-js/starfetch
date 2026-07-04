import { StarfetchError, type ResolvedTapTarget } from "@starfetch-js/core";

export type ToolResult = {
  content: [{ type: "text"; text: string }];
  isError?: true;
  structuredContent?: Record<string, unknown>;
};

export async function runTool(
  callback: () => Promise<ToolResult>,
): Promise<ToolResult> {
  try {
    return await callback();
  } catch (error) {
    return toolError(error);
  }
}

export function success<TData, TDiagnostics extends Record<string, unknown>>(
  data: TData,
  diagnostics: TDiagnostics,
): ToolResult {
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

function toolError(error: unknown): ToolResult {
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
