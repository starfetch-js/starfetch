type CloseableMcpServer = Readonly<{
  close(): Promise<void>;
}>;

export type OwnedMcpExchange = Readonly<{
  close(): Promise<void>;
  ownResponse(response: Response): Promise<Response>;
}>;

export type ExchangeRegistry = Readonly<{
  forceClose(): void;
  track(
    server: CloseableMcpServer,
    signal: AbortSignal,
    requestId: string,
  ): OwnedMcpExchange;
  waitForIdle(graceMs: number): Promise<boolean>;
}>;

export function createExchangeRegistry(
  reportCleanupFailure: (requestId: string) => void = () => undefined,
): ExchangeRegistry {
  const active = new Set<OwnedMcpExchange>();
  const idleWaiters = new Set<() => void>();

  const notifyIfIdle = () => {
    if (active.size !== 0) {
      return;
    }

    for (const resolve of idleWaiters) {
      resolve();
    }
    idleWaiters.clear();
  };

  const waitForIdle = (graceMs: number): Promise<boolean> => {
    if (active.size === 0) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      let settled = false;
      const finish = (drained: boolean) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        idleWaiters.delete(onIdle);
        resolve(drained);
      };
      const onIdle = () => finish(true);
      const timeout = setTimeout(() => finish(false), graceMs);
      idleWaiters.add(onIdle);
    });
  };

  return {
    forceClose() {
      for (const exchange of active) {
        void exchange.close();
      }
    },
    track(server, signal, requestId) {
      let closePromise: Promise<void> | undefined;
      const exchange: OwnedMcpExchange = {
        close() {
          closePromise ??= (async () => {
            signal.removeEventListener("abort", abortListener);
            try {
              await server.close();
            } catch {
              try {
                reportCleanupFailure(requestId);
              } catch {
                // Cleanup and shutdown must not depend on the logging sink.
              }
            } finally {
              active.delete(exchange);
              notifyIfIdle();
            }
          })();
          return closePromise;
        },
        ownResponse(response) {
          return ownResponse(response, exchange.close);
        },
      };
      const abortListener = () => void exchange.close();
      signal.addEventListener("abort", abortListener, { once: true });
      active.add(exchange);
      return exchange;
    },
    waitForIdle,
  };
}

async function ownResponse(
  response: Response,
  close: () => Promise<void>,
): Promise<Response> {
  if (response.body === null) {
    await close();
    return response;
  }

  const reader = response.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        await close();
      }
    },
    async pull(controller) {
      try {
        const result = await reader.read();
        if (result.done) {
          await close();
          controller.close();
          return;
        }

        controller.enqueue(result.value);
      } catch (error) {
        await close();
        controller.error(error);
      }
    },
  });

  return new Response(body, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}
