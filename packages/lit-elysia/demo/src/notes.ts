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

export const addNote = (input: Pick<Note, 'title' | 'body'>): Note => {
  const note = {id: notes.length + 1, ...input, createdAt: new Date()};
  notes.push(note);
  return note;
};
