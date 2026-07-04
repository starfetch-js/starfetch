import { SaxesParser, type SaxesAttributeNS, type SaxesTagNS } from "saxes";

import { TapParseError } from "./errors.js";

export type XmlNode = {
  local: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  text: string;
};

export function parseXml(xml: string): XmlNode {
  const parser = new SaxesParser({ xmlns: true });
  const stack: XmlNode[] = [];
  let root: XmlNode | undefined;
  let parseError: Error | undefined;

  parser.on("opentag", (tag) => {
    const node = createNode(tag);
    const parent = stack.at(-1);

    if (parent !== undefined) {
      parent.children.push(node);
    } else {
      root = node;
    }

    stack.push(node);
  });
  parser.on("text", (text) => {
    appendText(stack.at(-1), text);
  });
  parser.on("cdata", (text) => {
    appendText(stack.at(-1), text);
  });
  parser.on("closetag", () => {
    stack.pop();
  });
  parser.on("error", (error) => {
    parseError = error;
  });

  try {
    parser.write(xml).close();
  } catch (error) {
    throw toTapParseError(error);
  }

  if (parseError !== undefined) {
    throw toTapParseError(parseError);
  }

  if (root === undefined) {
    throw new TapParseError("TAP metadata XML did not contain a root element");
  }

  return root;
}

export function directChildText(
  node: XmlNode,
  local: string,
): string | undefined {
  return directChildren(node, local).map(nodeText).find(isNonEmpty);
}

export function firstDescendantText(
  node: XmlNode,
  local: string,
): string | undefined {
  return descendants(node, local).map(nodeText).find(isNonEmpty);
}

export function directChildren(node: XmlNode, local: string): XmlNode[] {
  return node.children.filter((child) => isLocal(child, local));
}

export function descendants(node: XmlNode, local: string): XmlNode[] {
  const matches: XmlNode[] = [];

  for (const child of node.children) {
    if (isLocal(child, local)) {
      matches.push(child);
    }

    matches.push(...descendants(child, local));
  }

  return matches;
}

export function nodeText(node: XmlNode): string {
  return node.text.trim().replace(/\s+/g, " ");
}

function createNode(tag: SaxesTagNS): XmlNode {
  const attributes: Record<string, string> = {};

  for (const attribute of Object.values(tag.attributes)) {
    storeAttribute(attributes, attribute);
  }

  return {
    attributes,
    children: [],
    local: tag.local,
    text: "",
  };
}

function storeAttribute(
  attributes: Record<string, string>,
  attribute: SaxesAttributeNS,
): void {
  attributes[attribute.name.toLowerCase()] = attribute.value;
  attributes[attribute.local.toLowerCase()] = attribute.value;
}

function appendText(node: XmlNode | undefined, text: string): void {
  if (node !== undefined) {
    node.text += text;
  }
}

function toTapParseError(error: unknown): TapParseError {
  const message = error instanceof Error ? error.message : "Unknown XML error";
  return new TapParseError(`Failed to parse TAP metadata XML: ${message}`);
}

function isLocal(node: XmlNode, local: string): boolean {
  return node.local.toLowerCase() === local.toLowerCase();
}

function isNonEmpty(value: string): boolean {
  return value.length > 0;
}
