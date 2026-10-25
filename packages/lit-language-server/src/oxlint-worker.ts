/**
 * The lint plugin's worker: checks one file per message and answers on the
 * message's port, then wakes the waiting rule through its signal.
 */

import {type MessagePort, parentPort} from 'node:worker_threads';
import {createChecker} from './check.js';

export interface CheckMessage {
  file: string;
  code: string;
  port: MessagePort;
  /** Set to 1 and notified once the answer is on the port. */
  signal: Int32Array;
}

const checker = createChecker();

parentPort?.on('message', async ({file, code, port, signal}: CheckMessage) => {
  try {
    port.postMessage({problems: await checker.check(file, code)});
  } catch (error) {
    port.postMessage({
      error:
        error instanceof Error ? (error.stack ?? error.message) : String(error),
    });
  }
  port.close();
  Atomics.store(signal, 0, 1);
  Atomics.notify(signal, 0);
});
