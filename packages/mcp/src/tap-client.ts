import {
  parseTapJobReference,
  tap,
  type QueryOptions,
  type TapClientOptions,
  type TapUpload,
} from "@starfetch-js/core";

import type { TapJobInput, TapUploadsInput, TargetInput } from "./schemas.js";
import type { StarfetchMcpServerOptions } from "./server.js";

export function createTapClient(
  input: TargetInput,
  options: StarfetchMcpServerOptions,
): ReturnType<typeof tap> {
  const clientOptions: TapClientOptions = {};

  if (options.fetch !== undefined) {
    clientOptions.fetch = options.fetch;
  }

  if (input.url !== undefined) {
    return tap(
      input.service === undefined
        ? { url: input.url }
        : { service: input.service, url: input.url },
      clientOptions,
    );
  }

  if (input.service === undefined) {
    throw new Error("Specify service or url.");
  }

  return tap({ service: input.service }, clientOptions);
}

export function createTapJobClient(
  input: TapJobInput,
  options: StarfetchMcpServerOptions,
): ReturnType<typeof tap> {
  const reference = parseTapJobReference(input.jobIdOrUrl);

  if (reference.kind === "absolute-url") {
    return createTapClient({ url: reference.baseUrl }, options);
  }

  if (input.service !== undefined || input.url !== undefined) {
    return createTapClient(input, options);
  }

  throw new Error("Specify service or url when jobIdOrUrl is not absolute.");
}

export function createTapUploads(
  uploads: TapUploadsInput,
): QueryOptions["uploads"] {
  if (uploads === undefined) {
    return undefined;
  }

  return uploads.map((upload): TapUpload => {
    if ("uri" in upload) {
      return upload;
    }

    if (upload.filename !== undefined) {
      return {
        filename: upload.filename,
        tableName: upload.tableName,
        votable: upload.votable,
      };
    }

    return {
      tableName: upload.tableName,
      votable: upload.votable,
    };
  });
}
