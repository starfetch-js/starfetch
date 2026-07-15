import { type Server } from "node:http";

import { serve } from "@hono/node-server";
import { type Hono } from "hono";

export type HttpListener = Server;

export function listen(
  app: Hono,
  host: string,
  port: number,
): Promise<HttpListener> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    const listener = serve(
      {
        fetch: app.fetch,
        hostname: host,
        port,
      },
      () => {
        listener.off("error", onError);
        resolve(listener as Server);
      },
    );
    listener.once("error", onError);
  });
}

export function closeHttpListener(listener: HttpListener): Promise<void> {
  return new Promise((resolve, reject) => {
    listener.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
