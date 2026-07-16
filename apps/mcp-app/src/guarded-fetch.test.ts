import { describe, expect, it, vi } from "vitest";

import { createGuardedFetch, isPublicIp } from "./guarded-fetch.js";
import type {
  PinnedHttpResponse,
  PinnedHttpTransport,
} from "./pinned-http-transport.js";

describe("hosted guarded fetch", () => {
  it("rejects private, loopback, link-local, and mapped-private addresses", () => {
    expect(isPublicIp("8.8.8.8")).toBe(true);
    expect(isPublicIp("127.0.0.1")).toBe(false);
    expect(isPublicIp("10.0.0.1")).toBe(false);
    expect(isPublicIp("169.254.1.1")).toBe(false);
    expect(isPublicIp("::1")).toBe(false);
    expect(isPublicIp("::ffff:10.0.0.1")).toBe(false);
  });

  it("rejects non-HTTPS targets before transport", async () => {
    const guarded = createGuardedFetch({
      maxConcurrency: 1,
      maxRedirects: 3,
      maxResponseBytes: 1024,
      transport: createTestTransport(() => new Response("unexpected")),
      userAgent: "starfetch-test",
    });
    await expect(guarded("http://example.com/tap")).rejects.toThrow(
      "TARGET_FORBIDDEN",
    );
  });

  it.each([
    {
      code: "TARGET_FORBIDDEN",
      init: undefined,
      name: "URL credentials",
      resolve: undefined,
      url: "https://user:secret@example.com/tap",
    },
    {
      code: "AUTHORITY_FORBIDDEN",
      init: { headers: { authorization: "Bearer secret" } },
      name: "authorization headers",
      resolve: undefined,
      url: "https://example.com/tap",
    },
    {
      code: "AUTHORITY_FORBIDDEN",
      init: { headers: { cookie: "session=secret" } },
      name: "cookie headers",
      resolve: undefined,
      url: "https://example.com/tap",
    },
    {
      code: "TARGET_FORBIDDEN",
      init: undefined,
      name: "mixed public and private DNS answers",
      resolve: async () => [
        { address: "93.184.216.34", family: 4 as const },
        { address: "127.0.0.1", family: 4 as const },
      ],
      url: "https://example.com/tap",
    },
  ])("rejects $name", async ({ code, init, resolve, url }) => {
    const guarded = createGuardedFetch({
      maxConcurrency: 1,
      maxRedirects: 0,
      maxResponseBytes: 1024,
      ...(resolve === undefined ? {} : { resolve }),
      transport: createTestTransport(() => new Response("unexpected")),
      userAgent: "starfetch-test",
    });

    await expect(guarded(url, init)).rejects.toThrow(code);
  });

  it("pins each validated hop, follows bounded same-origin GET redirects, and limits bodies", async () => {
    const resolve = vi.fn(async () => [
      { address: "93.184.216.34", family: 4 as const },
    ]);
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        pinnedResponse(
          new Response(null, {
            headers: { location: "/tap/next" },
            status: 302,
          }),
        ),
      )
      .mockResolvedValueOnce(pinnedResponse(new Response("ok")));
    const guarded = createGuardedFetch({
      maxConcurrency: 1,
      maxRedirects: 3,
      maxResponseBytes: 2,
      resolve,
      transport: { request },
      userAgent: "starfetch-test",
    });

    await expect(
      guarded("https://example.com/tap").then((response) => response.text()),
    ).resolves.toBe("ok");
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledTimes(2);

    const tooLarge = createGuardedFetch({
      maxConcurrency: 1,
      maxRedirects: 0,
      maxResponseBytes: 1,
      resolve,
      transport: createTestTransport(() => new Response("large")),
      userAgent: "starfetch-test",
    });
    await expect(tooLarge("https://example.com/tap")).rejects.toThrow(
      "RESPONSE_TOO_LARGE",
    );
  });

  it("rejects redirect exhaustion and declared oversized responses", async () => {
    const resolve = async () => [
      { address: "93.184.216.34", family: 4 as const },
    ];
    const redirects = createGuardedFetch({
      maxConcurrency: 1,
      maxRedirects: 1,
      maxResponseBytes: 1024,
      resolve,
      transport: createTestTransport(
        () =>
          new Response(null, {
            headers: { location: "/next" },
            status: 302,
          }),
      ),
      userAgent: "starfetch-test",
    });
    await expect(redirects("https://example.com/tap")).rejects.toThrow(
      "REDIRECT_FORBIDDEN",
    );

    const declaredOversize = createGuardedFetch({
      maxConcurrency: 1,
      maxRedirects: 0,
      maxResponseBytes: 10,
      resolve,
      transport: createTestTransport(
        () =>
          new Response(null, {
            headers: { "content-length": "11" },
          }),
      ),
      userAgent: "starfetch-test",
    });
    await expect(declaredOversize("https://example.com/tap")).rejects.toThrow(
      "RESPONSE_TOO_LARGE",
    );
  });

  it("cancels while DNS resolution is pending", async () => {
    const controller = new AbortController();
    const guarded = createGuardedFetch({
      maxConcurrency: 1,
      maxRedirects: 0,
      maxResponseBytes: 1,
      resolve: () => new Promise(() => undefined),
      userAgent: "starfetch-test",
    });
    const pending = guarded("https://example.com/tap", {
      signal: controller.signal,
    });
    await expect(guarded("https://example.com/other")).rejects.toThrow(
      "CONCURRENCY_EXCEEDED",
    );
    controller.abort(new Error("cancelled"));
    await expect(pending).rejects.toThrow("cancelled");
  });

  it("cancels a pending response stream", async () => {
    const controller = new AbortController();
    let streamCancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        streamCancelled = true;
      },
      pull() {
        return new Promise(() => undefined);
      },
    });
    const guarded = createGuardedFetch({
      maxConcurrency: 1,
      maxRedirects: 0,
      maxResponseBytes: 1024,
      resolve: async () => [{ address: "93.184.216.34", family: 4 as const }],
      transport: {
        async request() {
          return {
            body,
            async close() {},
            headers: new Headers(),
            status: 200,
            statusText: "OK",
          };
        },
      },
      userAgent: "starfetch-test",
    });
    const pending = guarded("https://example.com/tap", {
      signal: controller.signal,
    });
    await Promise.resolve();
    controller.abort(new Error("cancelled"));

    const outcome = await Promise.race([
      pending.then(
        () => "completed",
        (error: unknown) =>
          error instanceof Error ? error.message : "unknown error",
      ),
      new Promise<string>((resolveOutcome) => {
        setTimeout(() => resolveOutcome("timed out"), 50);
      }),
    ]);
    expect(outcome).toBe("cancelled");
    expect(streamCancelled).toBe(true);
  });

  it("never follows write redirects and rejects cross-origin locations", async () => {
    const resolve = async () => [
      { address: "93.184.216.34", family: 4 as const },
    ];
    const request = vi.fn(async () =>
      pinnedResponse(
        new Response(null, {
          headers: { location: "https://example.com/tap/async/1" },
          status: 303,
        }),
      ),
    );
    const guarded = createGuardedFetch({
      maxConcurrency: 1,
      maxRedirects: 3,
      maxResponseBytes: 1024,
      resolve,
      transport: { request },
      userAgent: "starfetch-test",
    });
    const response = await guarded("https://example.com/tap/async", {
      body: new URLSearchParams({ QUERY: "SELECT TOP 1 * FROM source" }),
      method: "POST",
    });
    expect(response.status).toBe(303);
    expect(request).toHaveBeenCalledTimes(1);

    const crossOrigin = createGuardedFetch({
      maxConcurrency: 1,
      maxRedirects: 3,
      maxResponseBytes: 1024,
      resolve,
      transport: createTestTransport(
        () =>
          new Response(null, {
            headers: { location: "https://other.example/tap" },
            status: 302,
          }),
      ),
      userAgent: "starfetch-test",
    });
    await expect(crossOrigin("https://example.com/tap")).rejects.toThrow(
      "REDIRECT_FORBIDDEN",
    );
  });

  it("preserves empty successful responses", async () => {
    const guarded = createGuardedFetch({
      maxConcurrency: 1,
      maxRedirects: 0,
      maxResponseBytes: 1024,
      resolve: async () => [{ address: "93.184.216.34", family: 4 as const }],
      transport: createTestTransport(() => new Response(null, { status: 204 })),
      userAgent: "starfetch-test",
    });
    await expect(guarded("https://example.com/tap")).resolves.toMatchObject({
      status: 204,
    });
  });
});

function createTestTransport(
  request: () => Response | Promise<Response>,
): PinnedHttpTransport {
  return {
    async request() {
      return pinnedResponse(await request());
    },
  };
}

function pinnedResponse(response: Response): PinnedHttpResponse {
  return {
    body: response.body,
    async close() {},
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  };
}
