/**
 * The pages whose loads ran, latest last: the root layout's load notes each
 * one. A page the client left during the latency wait never gets here,
 * which /api/loads shows.
 */
const log: string[] = [];

export const noteLoad = (path: string): void => {
  log.push(path);
  if (log.length > 50) log.shift();
};

export const loads = (): string[] => [...log];

export const clearLoads = (): void => {
  log.length = 0;
};
