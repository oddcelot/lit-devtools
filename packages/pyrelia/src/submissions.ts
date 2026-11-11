/**
 * The form posts the browser is about to make, as their `submit` events saw
 * them. A navigation from a form post normally carries its form data, but
 * not when the submitter is gone by the time the navigation starts, which
 * is how some component libraries submit: Web Awesome's wa-button clicks a
 * button it adds to the form and removes it at once. The submit event still
 * has the form and its submitter, so the router takes the data from there.
 */
interface Posted {
  url: string;
  formData: FormData;
  at: number;
}

let posted: Posted | undefined;

/** How long a submission waits for its navigation. */
const PATIENCE = 1000;

export const watchSubmissions = (): void => {
  document.addEventListener(
    'submit',
    (event) => {
      const form = event.target as HTMLFormElement;
      const submitter = event.submitter as HTMLButtonElement | null;
      if (methodOf(form, submitter) !== 'post') return;
      posted = {
        url: actionOf(form, submitter),
        formData: formDataOf(form, submitter),
        at: Date.now(),
      };
    },
    {capture: true}
  );
};

/** A navigation's form data: its own, or that of the post that started it. */
export const postedData = (
  url: string,
  own: FormData | null
): FormData | null => {
  const recent = takePosted();
  return own ?? (recent?.url === url ? recent.formData : null);
};

/** The last submission, once, if it is recent enough to be this one's. */
const takePosted = () => {
  const last = posted;
  posted = undefined;
  return last && Date.now() - last.at < PATIENCE ? last : undefined;
};

const methodOf = (form: HTMLFormElement, submitter: HTMLButtonElement | null) =>
  (submitter?.getAttribute('formmethod') ?? form.method).toLowerCase();

const actionOf = (form: HTMLFormElement, submitter: HTMLButtonElement | null) =>
  submitter?.hasAttribute('formaction') ? submitter.formAction : form.action;

const formDataOf = (
  form: HTMLFormElement,
  submitter: HTMLButtonElement | null
) => {
  try {
    return new FormData(form, submitter);
  } catch {
    // A submitter that isn't one of the form's own buttons.
    return new FormData(form);
  }
};
