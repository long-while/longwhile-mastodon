import { useCallback, useEffect, useRef, useState } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import { showAlert } from 'mastodon/actions/alerts';
import { CheckBox } from 'mastodon/components/check_box';
import { me } from 'mastodon/initial_state';
import { useAppDispatch } from 'mastodon/store/typed_functions';
import { logOut } from 'mastodon/utils/log_out';
import { loadAllEntries } from 'mastodon/utils/multi_account_db';

import type { BaseConfirmationModalProps } from './confirmation_modal';
import { ConfirmationModal } from './confirmation_modal';

const messages = defineMessages({
  logoutTitle: { id: 'confirmations.logout.title', defaultMessage: 'Log out?' },
  logoutMessage: {
    id: 'confirmations.logout.message',
    defaultMessage: 'Are you sure you want to log out?',
  },
  logoutConfirm: {
    id: 'confirmations.logout.confirm',
    defaultMessage: 'Log out',
  },
  forgetSavedAccounts: {
    id: 'confirmations.logout.forget_saved_accounts',
    defaultMessage: 'Also remove account info saved on this device',
  },
  forgetSavedAccountsHint: {
    id: 'confirmations.logout.forget_saved_accounts_hint',
    defaultMessage:
      'Your accounts themselves are not deleted. You can switch to them again after adding them back.',
  },
  logoutFailed: {
    id: 'confirmations.logout.failed',
    defaultMessage: 'Could not log out. Check your connection and try again.',
  },
});

const useHasOtherSavedAccounts = (): boolean => {
  const [hasOthers, setHasOthers] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadAllEntries()
      .then((entries) => {
        if (cancelled) return;

        setHasOthers(
          Object.entries(entries).some(([key, entry]) => {
            const id = entry.id || key;
            return id !== me;
          }),
        );
      })
      .catch((error: unknown) => {
        console.warn(
          '[MultiAccount] Could not read the saved accounts:',
          error,
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return hasOthers;
};

export const ConfirmLogOutModal: React.FC<BaseConfirmationModalProps> = ({
  onClose,
}) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const hasOtherSavedAccounts = useHasOtherSavedAccounts();
  const [forgetSavedAccounts, setForgetSavedAccounts] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const handleForgetChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setForgetSavedAccounts(event.target.checked);
    },
    [],
  );

  const onConfirm = useCallback(() => {
    if (busyRef.current) {
      return;
    }

    busyRef.current = true;
    setBusy(true);

    logOut({
      forgetSavedAccounts: forgetSavedAccounts && hasOtherSavedAccounts,
    }).catch(() => {
      busyRef.current = false;
      setBusy(false);
      dispatch(showAlert({ message: messages.logoutFailed }));
    });
  }, [dispatch, forgetSavedAccounts, hasOtherSavedAccounts]);

  return (
    <ConfirmationModal
      title={intl.formatMessage(messages.logoutTitle)}
      message={
        <>
          {intl.formatMessage(messages.logoutMessage)}
          {hasOtherSavedAccounts && (
            <span className='confirmation-modal__option'>
              <CheckBox
                name='forget_saved_accounts'
                value='1'
                checked={forgetSavedAccounts}
                onChange={handleForgetChange}
                label={
                  <>
                    {intl.formatMessage(messages.forgetSavedAccounts)}
                    <span className='confirmation-modal__option-hint'>
                      {intl.formatMessage(messages.forgetSavedAccountsHint)}
                    </span>
                  </>
                }
              />
            </span>
          )}
        </>
      }
      confirm={intl.formatMessage(messages.logoutConfirm)}
      confirmDisabled={busy}
      closeWhenConfirm={false}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
};
