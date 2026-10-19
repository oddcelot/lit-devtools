import * as v from 'valibot';

/**
 * The rules that depend on more than one field, over the form's `FormData`.
 * A control checks only itself (`required`, `type="email"`), so a rule like
 * "email is required once the newsletter is on" lives here. `forward()`
 * files each issue under the field it is about, and `<fm-feedback>` hands
 * it to that control's `setCustomValidity()`.
 *
 * `FormData` leaves out a switch that is off and a rating with no star, so
 * those keys are optional.
 */
const FeedbackSchema = v.pipe(
  v.object({
    email: v.optional(v.string(), ''),
    newsletter: v.optional(v.string()),
    rating: v.optional(v.pipe(v.string(), v.toNumber())),
    comment: v.optional(v.string(), ''),
  }),
  v.forward(
    v.partialCheck(
      [['newsletter'], ['email']],
      ({newsletter, email}) => newsletter === undefined || email !== '',
      'Add an email for the newsletter to go to.'
    ),
    ['email']
  ),
  v.forward(
    v.partialCheck(
      [['rating'], ['comment']],
      ({rating, comment}) =>
        rating === undefined || rating > 2 || comment.trim() !== '',
      'Sorry to hear it. Tell us what went wrong.'
    ),
    ['comment']
  )
);

/** The first message for each field the schema has an issue with. */
export const feedbackIssues = (form: HTMLFormElement): Map<string, string> => {
  const result = v.safeParse(
    FeedbackSchema,
    Object.fromEntries(new FormData(form))
  );
  const nested = result.issues
    ? (v.flatten<typeof FeedbackSchema>(result.issues).nested ?? {})
    : {};
  return new Map(
    Object.entries(nested).map(([field, messages]) => [
      field,
      messages?.[0] ?? '',
    ])
  );
};
