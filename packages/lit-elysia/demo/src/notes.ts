export interface Note {
  id: number;
  title: string;
  body: string;
}

const notes: Note[] = [
  {id: 1, title: 'Elysia', body: 'The server: routes, the API, validation.'},
  {id: 2, title: 'Lit', body: 'The pages: rendered on the server, hydrated.'},
];

export const allNotes = (): Note[] => notes;

export const findNote = (id: number): Note | undefined =>
  notes.find((note) => note.id === id);

export const addNote = (input: Omit<Note, 'id'>): Note => {
  const note = {id: notes.length + 1, ...input};
  notes.push(note);
  return note;
};
