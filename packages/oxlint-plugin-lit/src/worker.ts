/**
 * The lint plugin's worker: checks one file per message and answers on the
 * message's port, then wakes the waiting rule through its signal.
 */

import {parentPort} from 'node:worker_threads';
import {createChecker} from './check.js';
import type {CheckMessage} from './index.js';

const checker = createChecker();

parentPort?.on('message', async (message: CheckMessage) => {
  const {file, code, rulesOff, port, signal} = message;
  try {
    port.postMessage({problems: await checker.check(file, code, rulesOff)});
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
