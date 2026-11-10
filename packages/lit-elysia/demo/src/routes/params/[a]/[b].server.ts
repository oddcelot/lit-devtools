import {route} from '@oddsquad/lit-elysia/routes';

// `params.a` and `params.b` are typed from the path.
export const load = route('/params/:a/:b').load(({params}) => ({
  a: params.a,
  b: params.b,
}));
