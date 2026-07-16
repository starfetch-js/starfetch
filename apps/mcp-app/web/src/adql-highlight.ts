import sql from "@shikijs/langs/sql";
import githubDark from "@shikijs/themes/github-dark";
import githubLight from "@shikijs/themes/github-light";
import { createHighlighterCore } from "@shikijs/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";

export type AdqlToken = Readonly<{
  content: string;
  darkColor: string | undefined;
  fontStyle: number;
  lightColor: string | undefined;
}>;

export type HighlightedAdql = readonly (readonly AdqlToken[])[];

const highlighter = createHighlighterCore({
  engine: createJavaScriptRegexEngine(),
  langs: [sql],
  themes: [githubLight, githubDark],
});

export async function highlightAdql(query: string): Promise<HighlightedAdql> {
  const instance = await highlighter;
  return instance
    .codeToTokensWithThemes(query, {
      lang: "sql",
      themes: { dark: "github-dark", light: "github-light" },
    })
    .map((line) =>
      line.map((token) => ({
        content: token.content,
        darkColor: token.variants.dark?.color,
        fontStyle:
          token.variants.light?.fontStyle ??
          token.variants.dark?.fontStyle ??
          0,
        lightColor: token.variants.light?.color,
      })),
    );
}
