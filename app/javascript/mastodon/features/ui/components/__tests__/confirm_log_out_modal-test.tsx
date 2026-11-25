import { IntlProvider } from 'react-intl';

import { Provider } from 'react-redux';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmLogOutModal } from '../confirmation_modals/log_out';

const mocks = vi.hoisted(() => ({
  logOut: vi.fn(),
  loadAllEntries: vi.fn(),
}));

vi.mock('mastodon/utils/log_out', () => ({ logOut: mocks.logOut }));

vi.mock('mastodon/utils/multi_account_db', () => ({
  loadAllEntries: mocks.loadAllEntries,
}));

vi.mock('mastodon/initial_state', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  me: 'A',
}));

const dispatched: { type?: string }[] = [];

const fakeStore = {
  getState: () => ({}),
  subscribe: () => () => undefined,
  dispatch: (action: { type?: string }) => {
    dispatched.push(action);
    return action;
  },
};

const entry = (id: string) => ({ id });

const renderModal = async () => {
  render(
    <Provider store={fakeStore as never}>
      <IntlProvider locale='en'>
        <ConfirmLogOutModal onClose={vi.fn()} />
      </IntlProvider>
    </Provider>,
  );

  await act(async () => {
    await Promise.resolve();
  });
};

const confirmButton = () => screen.getByRole('button', { name: 'Log out' });

describe('<ConfirmLogOutModal />', () => {
  beforeEach(() => {
    dispatched.length = 0;
    mocks.logOut.mockReset();
    mocks.loadAllEntries.mockReset();
    mocks.loadAllEntries.mockResolvedValue({ A: entry('A'), B: entry('B') });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs out and keeps the saved accounts by default', async () => {
    mocks.logOut.mockReturnValue(new Promise(() => undefined));
    await renderModal();

    fireEvent.click(confirmButton());

    expect(mocks.logOut).toHaveBeenCalledWith({ forgetSavedAccounts: false });
  });

  it('passes forgetSavedAccounts when the checkbox is ticked', async () => {
    mocks.logOut.mockReturnValue(new Promise(() => undefined));
    await renderModal();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(confirmButton());

    expect(mocks.logOut).toHaveBeenCalledWith({ forgetSavedAccounts: true });
  });

  it('hides the option when no other account is saved', async () => {
    mocks.loadAllEntries.mockResolvedValue({ A: entry('A') });
    await renderModal();

    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('runs the log out once when the button is clicked repeatedly', async () => {
    mocks.logOut.mockReturnValue(new Promise(() => undefined));
    await renderModal();

    fireEvent.click(confirmButton());
    fireEvent.click(confirmButton());

    expect(mocks.logOut).toHaveBeenCalledTimes(1);
    expect(confirmButton().hasAttribute('disabled')).toBe(true);
  });

  it('tells the user and unlocks the button when the log out fails', async () => {
    mocks.logOut.mockRejectedValue(new Error('offline'));
    await renderModal();

    await act(async () => {
      fireEvent.click(confirmButton());
      await Promise.resolve();
    });

    expect(dispatched.some((action) => action.type === 'alerts/show')).toBe(
      true,
    );
    expect(confirmButton().hasAttribute('disabled')).toBe(false);
  });
});
