const TOAST = '.unsaved-changes-toast';
const SHAKE_CLASS = 'unsaved-changes-toast--shake';

export const serializeForm = (form: HTMLFormElement) => {
  const entries: string[] = [];

  new FormData(form).forEach((value, name) => {
    if (name === 'authenticity_token') return;

    const text =
      typeof value === 'string' ? value : `file:${value.name}:${value.size}`;
    entries.push(`${name}=${text}`);
  });

  return entries.join('\n');
};

const hasServerErrors = (form: HTMLFormElement) =>
  form.querySelector('.flash-message.alert, .field_with_errors') !== null;

const isPlainClick = (event: MouseEvent) =>
  !event.defaultPrevented &&
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey;

export const leavingLink = (event: MouseEvent, form: HTMLFormElement) => {
  if (!isPlainClick(event) || !(event.target instanceof Element)) return null;

  const link = event.target.closest('a[href]');
  if (!(link instanceof HTMLAnchorElement) || form.contains(link)) return null;
  if (link.target && link.target !== '_self') return null;

  const url = new URL(link.href, window.location.href);
  const samePage =
    url.origin === window.location.origin &&
    url.pathname === window.location.pathname &&
    url.search === window.location.search;

  return samePage ? null : link;
};

const shake = (toast: HTMLElement) => {
  toast.classList.remove(SHAKE_CLASS);
  void toast.offsetWidth;
  toast.classList.add(SHAKE_CLASS);
};

interface GuardState {
  initial: string;
  dirty: boolean;
  warned: boolean;
  submitting: boolean;
}

const watchForm = (
  form: HTMLFormElement,
  toast: HTMLElement,
  state: GuardState,
  signal: AbortSignal,
) => {
  const update = () => {
    if (state.submitting) return;

    state.dirty =
      hasServerErrors(form) || serializeForm(form) !== state.initial;
    if (!state.dirty) state.warned = false;
    toast.hidden = !state.dirty;
  };

  form.addEventListener('input', update, { signal });
  form.addEventListener('change', update, { signal });

  form.addEventListener(
    'submit',
    () => {
      state.submitting = true;
      state.dirty = false;
      toast.hidden = true;
    },
    { signal },
  );

  toast.querySelector('.unsaved-changes-toast__save')?.addEventListener(
    'click',
    () => {
      form.requestSubmit();
    },
    { signal },
  );
};

const guardLeaving = (
  form: HTMLFormElement,
  toast: HTMLElement,
  state: GuardState,
  signal: AbortSignal,
) => {
  const handleClick = (event: MouseEvent) => {
    if (!state.dirty || !leavingLink(event, form)) return;

    if (state.warned) {
      state.dirty = false;
      return;
    }

    event.preventDefault();
    state.warned = true;
    shake(toast);
  };

  document.addEventListener('click', handleClick, { signal });
  window.addEventListener(
    'beforeunload',
    (event) => {
      if (state.dirty) event.preventDefault();
    },
    { signal },
  );
};

export const setupUnsavedChanges = (form: HTMLFormElement) => {
  const toast = document.querySelector<HTMLElement>(TOAST);
  if (!toast) return () => undefined;

  const controller = new AbortController();

  const state: GuardState = {
    initial: serializeForm(form),
    dirty: hasServerErrors(form),
    warned: false,
    submitting: false,
  };

  watchForm(form, toast, state, controller.signal);
  guardLeaving(form, toast, state, controller.signal);
  toast.hidden = !state.dirty;

  return () => {
    controller.abort();
  };
};

export const setupAllUnsavedChanges = () => {
  document
    .querySelectorAll<HTMLFormElement>('form[data-unsaved-guard]')
    .forEach(setupUnsavedChanges);
};
