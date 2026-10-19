import * as v from 'valibot';

/**
 * Every rule of the feedback form, over the controls' typed values: a string
 * from a text field, a number from the rating, a boolean from a switch, a
 * `Set` from the tags. `FormSchema` runs it after each change and routes
 * each message to the control named first in its path, so a rule about two
 * fields uses `forward()` to say which one to blame.
 */
export const FeedbackSchema = v.pipe(
  v.object({
    name: v.pipe(v.string(), v.trim(), v.minLength(2, 'Tell us your name.')),
    email: v.string(),
    rating: v.pipe(v.number(), v.minValue(1, 'Pick a rating.')),
    tags: v.set(v.string()),
    comment: v.string(),
    newsletter: v.boolean(),
    terms: v.literal(true, 'Accept the terms to send this.'),
  }),
  v.forward(
    v.partialCheck(
      [['newsletter'], ['email']],
      ({newsletter, email}) => !newsletter || email !== '',
      'Add an email for the newsletter to go to.'
    ),
    ['email']
  ),
  v.forward(
    v.partialCheck(
      [['rating'], ['comment'], ['tags']],
      ({rating, comment, tags}) =>
        rating > 2 || comment.trim() !== '' || tags.size > 0,
      'Sorry to hear it. Tell us what went wrong, here or with a tag.'
    ),
    ['comment']
  )
);
