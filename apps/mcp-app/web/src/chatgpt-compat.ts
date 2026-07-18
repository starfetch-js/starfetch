export type ChatGptToolSnapshot = Readonly<{
  metadata?: Record<string, unknown>;
  structuredContent: unknown;
}>;

type ChatGptOpenAi = Readonly<{
  getFileDownloadUrl?: (input: {
    fileId: string;
  }) => Promise<{ downloadUrl: string }>;
  openExternal?: (input: { href: string }) => void;
  toolOutput?: unknown;
  toolResponseMetadata?: unknown;
  uploadFile?: (file: File) => Promise<{ fileId: string }>;
}>;

declare global {
  interface Window {
    openai?: ChatGptOpenAi;
  }
}

export function subscribeToChatGptToolResults(
  listener: (snapshot: ChatGptToolSnapshot) => void,
): () => void {
  const publish = () => {
    const snapshot = readChatGptToolSnapshot();
    if (snapshot) listener(snapshot);
  };
  publish();
  window.addEventListener("openai:set_globals", publish);
  return () => window.removeEventListener("openai:set_globals", publish);
}

export function normalizeChatGptToolMetadata(
  value: unknown,
): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  if ("starfetchTableDataset" in value) return value;

  const toolResult = value.mcp_tool_result;
  if (!isRecord(toolResult) || !isRecord(toolResult._meta)) return undefined;
  return toolResult._meta;
}

export async function writeClipboardWithFallback(value: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText !== undefined) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {
    // Continue to the synchronous copy path allowed by older iframe hosts.
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard unavailable");
}

export async function saveFileThroughChatGpt(
  filename: string,
  mimeType: string,
  text: string,
): Promise<boolean> {
  const openai = window.openai;
  if (
    openai?.uploadFile === undefined ||
    openai.getFileDownloadUrl === undefined ||
    openai.openExternal === undefined
  ) {
    return false;
  }

  try {
    const { fileId } = await openai.uploadFile(
      new File([text], filename, { type: mimeType }),
    );
    const { downloadUrl } = await openai.getFileDownloadUrl({ fileId });
    openai.openExternal({ href: downloadUrl });
    return true;
  } catch {
    return false;
  }
}

function readChatGptToolSnapshot(): ChatGptToolSnapshot | undefined {
  const openai = window.openai;
  if (openai?.toolOutput === undefined) return undefined;
  const metadata = normalizeChatGptToolMetadata(openai.toolResponseMetadata);
  return {
    structuredContent: openai.toolOutput,
    ...(metadata === undefined ? {} : { metadata }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
