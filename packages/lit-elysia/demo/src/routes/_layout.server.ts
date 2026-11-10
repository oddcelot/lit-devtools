import {defineLoad} from '@oddsquad/lit-elysia/page';
import {allNotes} from '../notes.ts';

export const load = defineLoad(() => ({count: allNotes().length}));
