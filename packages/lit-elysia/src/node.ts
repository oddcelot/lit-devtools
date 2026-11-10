import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import {Readable} from 'node:stream';

type Fetch = (request: Request) => Response | Promise<Response>;

/** A Node request as a web `Request`, for Elysia's `fetch`. */
export const toRequest = (req: IncomingMessage, origin: string): Request => {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    for (const one of Array.isArray(value) ? value : [value]) {
      headers.append(name, one);
    }
  }
  const method = req.method ?? 'GET';
  const body = method === 'GET' || method === 'HEAD' ? undefined : req;
  return new Request(new URL(req.url ?? '/', origin), {
    method,
    headers,
    ...(body && {
      body: Readable.toWeb(body) as unknown as ReadableStream<Uint8Array>,
      duplex: 'half',
    }),
  } as RequestInit);
};

/** Writes a web `Response` to a Node response, streaming its body. */
export const sendResponse = async (
  res: ServerResponse,
  response: Response
): Promise<void> => {
  res.statusCode = response.status;
  for (const [name, value] of response.headers) {
    if (name === 'set-cookie') continue;
    res.setHeader(name, value);
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length) res.setHeader('set-cookie', cookies);
  if (!response.body) {
    res.end();
    return;
  }
  for await (const chunk of response.body) res.write(chunk);
  res.end();
};

/**
 * Serves a `fetch` handler, such as the built server entry's, with Node's
 * HTTP server; under Bun, run the entry itself instead.
 */
export const serve = (
  fetch: Fetch,
  {port = 3000, host = 'localhost'}: {port?: number; host?: string} = {}
): Promise<Server> => {
  const server = createServer((req, res) => {
    const origin = `http://${req.headers.host ?? `${host}:${port}`}`;
    Promise.resolve(fetch(toRequest(req, origin)))
      .then((response) => sendResponse(res, response))
      .catch((error: unknown) => {
        console.error(error);
        if (!res.headersSent) res.statusCode = 500;
        res.end();
      });
  });
  return new Promise((resolve) =>
    server.listen(port, host, () => resolve(server))
  );
};
