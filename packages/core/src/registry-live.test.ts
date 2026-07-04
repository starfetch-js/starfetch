import { describe, expect, it } from "vitest";

import { registry } from "./index.js";

const describeLiveRegistry =
  process.env.STARFETCH_LIVE_REGISTRY === "1" ? describe : describe.skip;

describeLiveRegistry("live VO registry discovery", () => {
  it("discovers real TAP endpoints from a public RegTAP registry", async () => {
    const services = await registry().searchTapServices({
      maxrec: 5,
      query: "gaia",
    });

    expect(services.length).toBeGreaterThan(0);
    expect(
      services.some((service) => /^https?:\/\//.test(service.accessUrl)),
    ).toBe(true);
  }, 30000);
});
