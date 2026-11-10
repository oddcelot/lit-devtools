import {
  createCrossDeserializer,
  toCrossJSONStream,
  type SerovalNode,
} from 'seroval';

/**
 * Page data on its way to the browser, as seroval's cross-JSON records: the
 * first holds the value, and each promise in it sends one more as it
 * settles. A `Date`, `Map`, `Set`, `BigInt`, `undefined` or an object
 * reached twice arrives as itself, so hydration renders what the server
 * rendered, and it reads back without `eval`.
 *
 * `<` is escaped in every record, so one can sit in a `<script>` element
 * without closing it.
 */
export async function* records(value: unknown): AsyncGenerator<string> {
  const queue: string[] = [];
  let done = false;
  let failure: unknown;
  let wake: (() => void) | undefined;
  const settle = () => {
    wake?.();
    wake = undefined;
  };
  toCrossJSONStream(value, {
    onParse: (node) => {
      queue.push(JSON.stringify(node).replaceAll('<', '\\u003c'));
      settle();
    },
    onError: (error) => {
      failure = error;
      done = true;
      settle();
    },
    onDone: () => {
      done = true;
      settle();
    },
  });
  for (;;) {
    while (queue.length) yield queue.shift()!;
    if (failure) throw failure;
    if (done) return;
    await new Promise<void>((resolve) => (wake = resolve));
  }
}

/** Reads one value's records, in order: its promises settle as theirs come. */
export interface Reader {
  /** A record as text, or as the object an inline script pushed. */
  read<T>(record: string | object): T;
  /** Rejects whatever is still pending, for a page that is gone. */
  abort(reason: unknown): void;
}

export const createReader = (): Reader => {
  const deserializer = createCrossDeserializer({});
  return {
    read: <T>(record: string | object) =>
      deserializer.deserialize<T>(
        (typeof record === 'string'
          ? JSON.parse(record)
          : record) as SerovalNode
      ),
    abort: (reason) => deserializer.abort(reason),
  };
};

/** Every record of a value, read back: for tests and tools. */
export const roundTrip = async <T>(value: unknown): Promise<T> => {
  const reader = createReader();
  let result: T | undefined;
  let first = true;
  for await (const record of records(value)) {
    if (first) result = reader.read<T>(record);
    else reader.read(record);
    first = false;
  }
  return result!;
};
