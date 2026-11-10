export interface Note {
  id: number;
  title: string;
  body: string;
  createdAt: Date;
}

const notes: Note[] = [
  {
    id: 1,
    title: 'Elysia',
    body: 'The server: routes, the API, validation.',
    createdAt: new Date('2026-11-01T09:30:00Z'),
  },
  {
    id: 2,
    title: 'Lit',
    body: 'The pages: rendered on the server, hydrated.',
    createdAt: new Date('2026-11-02T14:00:00Z'),
  },
];

export const allNotes = (): Note[] => notes;

export const findNote = (id: number): Note | undefined =>
  notes.find((note) => note.id === id);

export const noteTitled = (title: string): Note | undefined =>
  notes.find((note) => note.title.toLowerCase() === title.trim().toLowerCase());

const added = new EventTarget();

export const addNote = (input: Pick<Note, 'title' | 'body'>): Note => {
  const note = {id: notes.length + 1, ...input, createdAt: new Date()};
  notes.push(note);
  added.dispatchEvent(new CustomEvent('note', {detail: note}));
  return note;
};

/**
 * Each note added from now on, as it is added, until `signal` aborts.
 * The notes live in the server's memory, so on Workers a feed sees those
 * added in its own isolate.
 */
export async function* notesAdded(signal: AbortSignal): AsyncGenerator<Note> {
  const queue: Note[] = [];
  let wake: (() => void) | undefined;
  const onNote = (event: Event) => {
    queue.push((event as CustomEvent<Note>).detail);
    wake?.();
  };
  const onAbort = () => wake?.();
  added.addEventListener('note', onNote);
  signal.addEventListener('abort', onAbort);
  try {
    while (!signal.aborted) {
      const note = queue.shift();
      if (note) yield note;
      else await new Promise<void>((resolve) => (wake = resolve));
    }
  } finally {
    added.removeEventListener('note', onNote);
    signal.removeEventListener('abort', onAbort);
  }
}
