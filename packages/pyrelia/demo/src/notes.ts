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

export const addNote = (input: Pick<Note, 'title' | 'body'>): Note => {
  const note = {id: notes.length + 1, ...input, createdAt: new Date()};
  notes.push(note);
  return note;
};

/** Waits `ms`, or less: until `signal` aborts. */
const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });

/**
 * Each note added from now on, soon after it is added, until `signal`
 * aborts. It looks every half second rather than waiting to be told: a
 * Worker can't wake one request from another, and calls a request that
 * waits on one hung. The notes live in the server's memory, so on Workers
 * a feed sees those added in its own isolate.
 */
export async function* notesAdded(signal: AbortSignal): AsyncGenerator<Note> {
  let seen = notes.length;
  while (!signal.aborted) {
    await pause(500, signal);
    while (seen < notes.length) yield notes[seen++]!;
  }
}
