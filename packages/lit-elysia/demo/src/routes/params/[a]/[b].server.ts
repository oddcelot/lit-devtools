import {defineLoad} from '@oddsquad/lit-elysia/page';

export const load = defineLoad(({params}) => ({a: params.a!, b: params.b!}));
