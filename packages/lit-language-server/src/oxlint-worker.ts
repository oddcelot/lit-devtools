/**
 * The lint plugin's worker: checks one file per message and answers on the
 * message's port, then wakes the waiting rule through its signal.
 */

import {parentPort} from 'node:worker_threads';
import {createChecker} from './check.js';
import type {CheckMessage} from './oxlint.js';

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
