import { afterEach, describe, expect, it, vi } from 'vitest';

import { setupUnsavedChanges } from '../unsaved_changes';

let teardown: (() => void) | undefined;

const mount = (extra = '') => {
  document.body.innerHTML = `
    <nav><a id="away" href="/settings/profile">profile</a><a id="menu" href="#">menu</a></nav>
    <form data-unsaved-guard="true" action="/admin/settings/branding">
      ${extra}
      <input name="authenticity_token" value="token">
      <input id="title" name="form_admin_settings[site_title]" value="Longwhile">
    </form>
    <div class="unsaved-changes-toast" hidden>
      <span>message</span>
      <button type="button" class="unsaved-changes-toast__save">save</button>
    </div>`;

  const form = document.querySelector('form');
  const toast = document.querySelector<HTMLElement>('.unsaved-changes-toast');
  const title = document.querySelector<HTMLInputElement>('#title');
  if (!form || !toast || !title) throw new Error('missing fixture');

  teardown = setupUnsavedChanges(form);
  return { form, toast, title };
};

const type = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

const clickLink = (id: string) => {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  document.getElementById(id)?.dispatchEvent(event);
  return event;
};

afterEach(() => {
  teardown?.();
  teardown = undefined;
  document.body.innerHTML = '';
});

describe('setupUnsavedChanges', () => {
  it('shows the notice on the first change and hides it when reverted', () => {
    const { toast, title } = mount();
    expect(toast.hidden).toBe(true);

    type(title, 'Longwhile!');
    expect(toast.hidden).toBe(false);

    type(title, 'Longwhile');
    expect(toast.hidden).toBe(true);
  });

  it('stops the first attempt to leave and lets the second one go', () => {
    const { toast, title } = mount();
    type(title, 'changed');

    expect(clickLink('away').defaultPrevented).toBe(true);
    expect(toast.classList).toContain('unsaved-changes-toast--shake');
    expect(clickLink('away').defaultPrevented).toBe(false);
  });

  it('does not treat same-page links as leaving', () => {
    const { title } = mount();
    type(title, 'changed');

    expect(clickLink('menu').defaultPrevented).toBe(false);
  });

  it('submits the form from the notice', () => {
    const { form, toast, title } = mount();
    const requestSubmit = vi.fn();
    form.requestSubmit = requestSubmit;
    type(title, 'changed');

    toast
      .querySelector<HTMLButtonElement>('.unsaved-changes-toast__save')
      ?.click();

    expect(requestSubmit).toHaveBeenCalledTimes(1);
  });

  it('stays quiet while the form is being submitted', () => {
    const { form, toast, title } = mount();
    type(title, 'changed');

    form.dispatchEvent(new Event('submit', { cancelable: true }));

    expect(toast.hidden).toBe(true);
    expect(clickLink('away').defaultPrevented).toBe(false);
  });

  it('starts dirty when the server sent the form back with errors', () => {
    const { toast } = mount('<div class="flash-message alert">errors</div>');

    expect(toast.hidden).toBe(false);
  });
});
