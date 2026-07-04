import { describe, expect, it } from "vitest";

import {
  buildTapChildUrl,
  tapDeleteUrl,
  tapGet,
  tapPostForm,
} from "./tap-http.js";
import { TapHttpError } from "./errors.js";

describe("TAP HTTP helper", () => {
  it("builds child TAP resource URLs from normalized base URLs", () => {
    expect(buildTapChildUrl("https://example.test/tap", "sync").href).toBe(
      "https://example.test/tap/sync",
    );
    expect(buildTapChildUrl("https://example.test/tap/", "/sync").href).toBe(
      "https://example.test/tap/sync",
    );
    expect(
      buildTapChildUrl("https://example.test/tap-server/tap", "async").href,
    ).toBe("https://example.test/tap-server/tap/async");
  });

  it("sends form-encoded POST requests through injected fetch", async () => {
    const requests: Array<{
      url: string;
      method: string;
      contentType: string | null;
      body: string;
    }> = [];
    const fetchImpl = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const request = new Request(input, init);

      requests.push({
        url: request.url,
        method: request.method,
        contentType: request.headers.get("content-type"),
        body: await request.text(),
      });

      return new Response("ok");
    };
    const params = new URLSearchParams();

    params.set("LANG", "ADQL");
    params.set("QUERY", "SELECT TOP 1 * FROM mock_source");

    const response = await tapPostForm(
      "https://example.test/tap",
      "sync",
      params,
      { fetch: fetchImpl },
    );

    expect(await response.text()).toBe("ok");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      url: "https://example.test/tap/sync",
      method: "POST",
    });
    expect(requests[0]?.contentType).toContain(
      "application/x-www-form-urlencoded",
    );
    expect(new URLSearchParams(requests[0]?.body).get("LANG")).toBe("ADQL");
    expect(new URLSearchParams(requests[0]?.body).get("QUERY")).toBe(
      "SELECT TOP 1 * FROM mock_source",
    );
  });

  it("sends multipart POST requests without overriding the generated content type", async () => {
    const requests: Array<{
      contentType: string | null;
      body: string;
    }> = [];
    const fetchImpl = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const request = new Request(input, init);

      requests.push({
        contentType: request.headers.get("content-type"),
        body: await request.text(),
      });

      return new Response("ok");
    };
    const body = new FormData();

    body.set("LANG", "ADQL");
    body.set("QUERY", "SELECT * FROM TAP_UPLOAD.targets");
    body.set("UPLOAD", "targets,param:starfetch_upload_0");
    body.set("starfetch_upload_0", new Blob(["<VOTABLE />"]), "targets.xml");

    await tapPostForm("https://example.test/tap", "sync", body, {
      fetch: fetchImpl,
    });

    expect(requests[0]?.contentType).toContain("multipart/form-data");
    expect(requests[0]?.contentType).toContain("boundary=");
    expect(requests[0]?.body).toContain("targets,param:starfetch_upload_0");
    expect(requests[0]?.body).toContain("<VOTABLE />");
  });

  it("propagates abort signals to fetch", async () => {
    const controller = new AbortController();
    let capturedSignal: AbortSignal | undefined;
    const fetchImpl = async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      capturedSignal = init?.signal ?? undefined;
      return new Response("ok");
    };

    await tapPostForm(
      "https://example.test/tap",
      "sync",
      new URLSearchParams(),
      {
        fetch: fetchImpl,
        signal: controller.signal,
      },
    );

    expect(capturedSignal).toBe(controller.signal);
  });

  it("propagates redirect mode to fetch", async () => {
    let capturedRedirect: RequestRedirect | undefined;
    const fetchImpl = async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      capturedRedirect = init?.redirect;
      return new Response("ok");
    };

    await tapPostForm(
      "https://example.test/tap",
      "async",
      new URLSearchParams(),
      {
        fetch: fetchImpl,
        redirect: "manual",
      },
    );

    expect(capturedRedirect).toBe("manual");
  });

  it("sets user-agent when requested", async () => {
    let capturedUserAgent: string | null = null;
    const fetchImpl = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const request = new Request(input, init);

      capturedUserAgent = request.headers.get("user-agent");

      return new Response("ok");
    };

    await tapGet("https://example.test/tap", "availability", {
      fetch: fetchImpl,
      userAgent: "starfetch-test/0.1.0",
    });

    expect(capturedUserAgent).toBe("starfetch-test/0.1.0");
  });

  it("allows explicitly accepted non-2xx statuses", async () => {
    const fetchImpl = async (): Promise<Response> =>
      new Response(null, {
        status: 303,
        headers: { location: "https://example.test/tap/async/job-123" },
      });

    const response = await tapPostForm(
      "https://example.test/tap",
      "async",
      new URLSearchParams(),
      {
        acceptedStatuses: [303],
        fetch: fetchImpl,
        redirect: "manual",
      },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://example.test/tap/async/job-123",
    );
  });

  it("sends direct DELETE requests through injected fetch", async () => {
    let capturedMethod = "";
    let capturedRedirect: RequestRedirect | undefined;
    const fetchImpl = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const request = new Request(input, init);

      capturedMethod = request.method;
      capturedRedirect = request.redirect;

      return new Response(null, {
        status: 303,
        headers: { location: "https://example.test/tap/async" },
      });
    };

    const response = await tapDeleteUrl(
      "https://example.test/tap/async/job-123",
      {
        acceptedStatuses: [303],
        fetch: fetchImpl,
        redirect: "manual",
      },
    );

    expect(response.status).toBe(303);
    expect(capturedMethod).toBe("DELETE");
    expect(capturedRedirect).toBe("manual");
  });

  it("maps HTTP non-2xx responses to TapHttpError", async () => {
    const fetchImpl = async (): Promise<Response> =>
      new Response("unavailable", {
        status: 503,
        statusText: "Service Unavailable",
      });

    await expect(
      tapPostForm("https://example.test/tap", "sync", new URLSearchParams(), {
        fetch: fetchImpl,
      }),
    ).rejects.toMatchObject({
      name: "TapHttpError",
      status: 503,
      statusText: "Service Unavailable",
    });
  });

  it("maps non-2xx VOTable QUERY_STATUS errors to TapServiceError", async () => {
    const fetchImpl = async (): Promise<Response> =>
      new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<VOTABLE>
  <RESOURCE type="results">
    <INFO name="QUERY_STATUS" value="ERROR">Syntax error near FROM</INFO>
  </RESOURCE>
</VOTABLE>`,
        {
          status: 400,
          statusText: "Bad Request",
          headers: { "content-type": "application/x-votable+xml" },
        },
      );

    await expect(
      tapPostForm("https://example.test/tap", "sync", new URLSearchParams(), {
        fetch: fetchImpl,
      }),
    ).rejects.toMatchObject({
      name: "TapServiceError",
      message: "TAP service error: Syntax error near FROM",
    });
  });

  it("maps fetch rejections to TapHttpError", async () => {
    const fetchImpl = async (): Promise<Response> => {
      throw new Error("socket closed");
    };

    await expect(
      tapGet("https://example.test/tap", "availability", {
        fetch: fetchImpl,
      }),
    ).rejects.toThrow(TapHttpError);
    await expect(
      tapGet("https://example.test/tap", "availability", {
        fetch: fetchImpl,
      }),
    ).rejects.toThrow("socket closed");
  });
});
