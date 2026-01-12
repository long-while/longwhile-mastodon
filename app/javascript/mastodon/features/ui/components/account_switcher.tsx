import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type MouseEvent as ReactMouseEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { defineMessages, useIntl, type MessageDescriptor } from 'react-intl';

import { useSelector } from 'react-redux';

import MoreHorizIcon from '@/material-icons/400-24px/more_horiz.svg?react';
import CloseIcon from '@/material-icons/400-24px/close.svg?react';
import DeleteIcon from '@/material-icons/400-24px/delete.svg?react';
import CheckIcon from '@/material-icons/400-24px/check.svg?react';
import { Icon } from 'mastodon/components/icon';
import { CircularProgress } from 'mastodon/components/circular_progress';
import { showAlert } from 'mastodon/actions/alerts';
import type { Account } from 'mastodon/models/account';
import api, { currentAuthorizationToken } from 'mastodon/api';
import {
  registerAccount,
  switchAccount,
  registerAccountAction,
  removeAccount,
} from 'mastodon/actions/multi_account';
import type { MultiAccountEntry } from 'mastodon/types/multi_account';
import { useAppDispatch } from 'mastodon/store/typed_functions';
import {
  clearAllAccounts,
  loadAllEntries,
  loadEncryptedToken,
} from 'mastodon/utils/multi_account_db';
import { decryptToken } from 'mastodon/utils/multi_account_crypto';
import { clearActiveAccountIdInStorage } from 'mastodon/utils/multi_account_storage';
import { logOut } from 'mastodon/utils/log_out';

type MultiAccountsModule = typeof import('mastodon/api/multi_accounts');
type CallbackHandlerModule = typeof import('mastodon/features/multi_account/callback_handler');

const loadMultiAccountsModule = (): Promise<MultiAccountsModule> =>
  import('mastodon/api/multi_accounts');

const loadCallbackHandlerModule = (): Promise<CallbackHandlerModule> =>
  import('mastodon/features/multi_account/callback_handler');

const messages = defineMessages({
  switchAccount: { id: 'account_switcher.switch_account', defaultMessage: 'Switch account' },
  addAccount: { id: 'account_switcher.add_account', defaultMessage: 'Add another account' },
  addingAccount: { id: 'account_switcher.adding_account', defaultMessage: 'Adding account...' },
  addError: { id: 'account_switcher.add_error', defaultMessage: 'Failed to add account.' },
  switchError: { id: 'account_switcher.switch_error', defaultMessage: 'Failed to switch account.' },
  popupBlocked: { id: 'account_switcher.popup_blocked', defaultMessage: 'Popup was blocked. Please allow popups for this site.' },
  oauthPopupClosed: {
    id: 'account_switcher.oauth_popup_closed',
    defaultMessage: 'OAuth popup was closed before authorization completed.',
  },
  manageAccounts: {
    id: 'account_switcher.manage_accounts',
    defaultMessage: 'Manage accounts',
  },
  manageTitle: {
    id: 'account_switcher.manage_title',
    defaultMessage: 'Account management',
  },
  manageAddExisting: {
    id: 'account_switcher.manage_add_existing',
    defaultMessage: 'Add an existing account',
  },
  manageEmpty: {
    id: 'account_switcher.manage_empty',
    defaultMessage: 'No additional accounts saved yet.',
  },
  manageSwitch: {
    id: 'account_switcher.manage_switch',
    defaultMessage: 'Switch',
  },
  manageDelete: {
    id: 'account_switcher.manage_delete',
    defaultMessage: 'Log out & remove',
  },
  manageDeleteConfirmTitle: {
    id: 'account_switcher.manage_delete_confirm_title',
    defaultMessage: 'Remove {displayName}?',
  },
  manageDeleteConfirmDescription: {
    id: 'account_switcher.manage_delete_confirm_description',
    defaultMessage: 'Deleting this account will remove saved login data and sign it out on this device.',
  },
  manageDeleteCancel: {
    id: 'account_switcher.manage_delete_cancel',
    defaultMessage: 'Cancel',
  },
  manageDeleteConfirm: {
    id: 'account_switcher.manage_delete_confirm',
    defaultMessage: 'Remove account',
  },
  manageRemoveSuccess: {
    id: 'account_switcher.manage_remove_success',
    defaultMessage: 'The account was removed from this device.',
  },
  manageRemoveFailure: {
    id: 'account_switcher.manage_remove_failure',
    defaultMessage: 'Failed to remove the account. Please try again.',
  },
  manageSignOutFailure: {
    id: 'account_switcher.manage_sign_out_failure',
    defaultMessage: 'Account was removed locally, but signing out on the server failed.',
  },
  manageLogoutAll: {
    id: 'account_switcher.manage_logout_all',
    defaultMessage: 'Log out of all accounts',
  },
  manageLogoutAllError: {
    id: 'account_switcher.manage_logout_all_error',
    defaultMessage: 'Failed to log out of all accounts. Please try again.',
  },
});

interface AccountSwitcherTriggerArgs {
  openManage: () => void;
}

interface AccountSwitcherProps {
  renderTrigger?: (options: AccountSwitcherTriggerArgs) => ReactNode;
}
const knownErrorMessages: Record<string, MessageDescriptor> = {
  'OAuth popup was closed before authorization completed': messages.oauthPopupClosed,
};

export const AccountSwitcher: FC<AccountSwitcherProps> = ({ renderTrigger }) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoggingOutAll, setIsLoggingOutAll] = useState(false);
  const storingAccountIdsRef = useRef<Set<string>>(new Set());
  const [persistedAccounts, setPersistedAccounts] = useState<MultiAccountEntry[]>([]);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<MultiAccountEntry | null>(null);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);

  // Get multi-account state from Redux
  const multiAccountState = useSelector((state: any) => {
    if (typeof state?.getIn === 'function') {
      return state.getIn(['multiAccount']);
    }
    return state?.multiAccount ?? null;
  });

  const readMultiAccountValue = useCallback(
    (key: 'activeAccountId' | 'accounts') => {
      if (!multiAccountState) {
        return null;
      }
      if (typeof (multiAccountState as any).get === 'function') {
        return (multiAccountState as any).get(key);
      }
      return (multiAccountState as any)[key] ?? null;
    },
    [multiAccountState],
  );

  const activeAccountId = readMultiAccountValue('activeAccountId');
  const accounts = readMultiAccountValue('accounts');

  // Get current user account
  const currentAccount = useSelector((state: any) =>
    state.getIn(['accounts', state.getIn(['meta', 'me'])]),
  ) as Account | undefined;

  useEffect(() => {
    let isMounted = true;
    let cleanupHandler: (() => void) | undefined;

    const setup = async () => {
      const { initializeCallbackHandler, cleanupCallbackHandler } =
        await loadCallbackHandlerModule();

      if (!isMounted) {
        cleanupCallbackHandler();
        return;
      }

      initializeCallbackHandler();
      cleanupHandler = cleanupCallbackHandler;
    };

    void setup();

    return () => {
      isMounted = false;
      if (cleanupHandler) {
        cleanupHandler();
      } else {
        void loadCallbackHandlerModule().then(({ cleanupCallbackHandler }) => {
          cleanupCallbackHandler();
        });
      }
    };
  }, []);

  useEffect(() => {
    void loadAllEntries()
      .then((entries) => {
        setPersistedAccounts(Object.values(entries));
      })
      .catch((error) => {
        console.error('Failed to load persisted multi-account entries:', error);
      });
  }, []);

  const activeEntry = useMemo(() => {
    if (!activeAccountId || !accounts) {
    return null;
    }

    if (typeof (accounts as any).get === 'function') {
      return (accounts as any).get(activeAccountId);
    }

    return (accounts as any)[activeAccountId] ?? null;
  }, [activeAccountId, accounts]);

  const displayAvatar =
    activeEntry?.get?.('avatar') ??
    currentAccount?.avatar ??
    currentAccount?.avatar_static ??
    '';

  const displayName =
    activeEntry?.get?.('display_name') ??
    currentAccount?.display_name ??
    currentAccount?.username ??
    '';

  const displayAcct =
    activeEntry?.get?.('acct') ??
    currentAccount?.acct ??
    currentAccount?.username ??
    '';

  const activeAccount = useMemo(() => {
    if (activeEntry) {
      const entry = activeEntry.toJS ? activeEntry.toJS() : activeEntry;
      return {
        id: entry.id ?? activeAccountId ?? currentAccount?.id ?? 'active',
        acct: entry.acct ?? entry.username ?? '',
        displayName: entry.displayName ?? entry.acct ?? entry.username ?? '',
        avatar: entry.avatar ?? entry.avatar_static ?? displayAvatar,
      };
    }

    if (currentAccount) {
      return {
        id: currentAccount.id,
        acct: currentAccount.acct,
        displayName:
          currentAccount.display_name ?? currentAccount.username ?? '',
        avatar:
          currentAccount.avatar ?? currentAccount.avatar_static ?? displayAvatar,
      };
    }

    return null;
  }, [activeEntry, activeAccountId, currentAccount, displayAvatar]);

  const mergedAccounts = useMemo(() => {
    const map = new Map<string, MultiAccountEntry>();

    persistedAccounts.forEach((entry) => {
      if (entry?.id) {
        map.set(entry.id, entry);
      }
    });

    if (accounts) {
      const iterate = typeof (accounts as any).toList === 'function'
        ? (accounts as any).toList()
        : Object.values(accounts as Record<string, MultiAccountEntry>);

      iterate.forEach((entry: any) => {
          const normalized = entry?.toJS ? entry.toJS() : entry;
          if (normalized?.id) {
            map.set(normalized.id, normalized);
          }
        });
    }

    return Array.from(map.values());
  }, [accounts, persistedAccounts]);

  const managedAccounts = useMemo(() => {
    return [...mergedAccounts]
      .sort((a, b) => {
        const aIsActive = a.id === activeAccountId;
        const bIsActive = b.id === activeAccountId;

        if (aIsActive && !bIsActive) return -1;
        if (!aIsActive && bIsActive) return 1;

        const nameA = (a.displayName || a.acct || a.id || '').toLowerCase();
        const nameB = (b.displayName || b.acct || b.id || '').toLowerCase();
        if (nameA < nameB) return 1;
        if (nameA > nameB) return -1;
        return 0;
      })
      .slice(0, 10);
  }, [mergedAccounts, activeAccountId]);

  const ensureAccountRegistered = useCallback(
    async (accountId: string) => {
      const accountExists =
        !!accounts &&
        (typeof (accounts as any).has === 'function'
          ? (accounts as any).has(accountId)
          : Boolean((accounts as any)[accountId]));

      if (accountExists) {
        return true;
      }

      const fallbackEntry =
        mergedAccounts.find((entry) => entry.id === accountId) ??
        (() => {
          const entries = persistedAccounts;
          return entries.find((entry) => entry.id === accountId);
        })();

      if (fallbackEntry) {
        dispatch(registerAccountAction(fallbackEntry));
        return true;
      }

      try {
        const storedEntries = await loadAllEntries();
        const storedEntry = storedEntries[accountId];
        if (storedEntry) {
          dispatch(registerAccountAction(storedEntry));
          return true;
        }
      } catch (loadError) {
        console.error(
          `Failed to load entry for account ${accountId}:`,
          loadError,
        );
      }

      return false;
    },
    [accounts, mergedAccounts, persistedAccounts, dispatch],
  );

  const handleSwitchAccount = useCallback(
    async (accountId: string) => {
      try {
        const registered = await ensureAccountRegistered(accountId);
        if (!registered) {
          throw new Error('?�당 계정??불러?��? 못했?�니??');
        }

        await dispatch(switchAccount(accountId) as unknown as any);
      } catch (error) {
        console.error(error);
        dispatch(
          showAlert({
            message:
              error instanceof Error
                ? error.message
                : intl.formatMessage(messages.switchError),
          }),
        );
      }
    },
    [dispatch, ensureAccountRegistered, intl],
  );

  const ensureAccountStored = useCallback(async () => {
    if (!currentAccount) {
      console.log(
        '[DEBUG] ensureAccountStored aborted: current account unavailable',
      );
      return;
    }

    const accountId = currentAccount.id;
    const hasStoredAccount = (() => {
      if (!accounts) return false;
      if (typeof (accounts as any).has === 'function') {
        return (accounts as any).has(accountId);
      }
      return Boolean((accounts as any)[accountId]);
    })();

    if (hasStoredAccount || storingAccountIdsRef.current.has(accountId)) {
      console.log(
        '[DEBUG] ensureAccountStored skipped for',
        accountId,
        '(already stored or in-progress)',
      );
      return;
    }

    try {
      const existingEncrypted = await loadEncryptedToken(accountId);
      if (existingEncrypted) {
        console.log(
          '[DEBUG] ensureAccountStored skipped: encrypted token already exists for',
          accountId,
        );
        return;
      }
    } catch (error) {
      console.log(
        '[DEBUG] ensureAccountStored no existing encrypted token found, proceeding:',
        error,
      );
    }

    console.log('[DEBUG] === ensureAccountStored START ===');
    console.log('[DEBUG] Storing account:', accountId);

    const token = currentAuthorizationToken();
    const tokenPreview =
      typeof token === 'string' ? token.substring(0, 30) : 'N/A';
    console.log('[DEBUG] Current API token (first 30):', tokenPreview);

    if (!token) {
      console.warn('Unable to capture current account token for multi-account storage.');
      console.log('[DEBUG] === ensureAccountStored END (missing token) ===');
      return;
    }

    storingAccountIdsRef.current.add(accountId);

    const entry: MultiAccountEntry = {
      id: currentAccount.id,
      acct: currentAccount.acct ?? currentAccount.username ?? '',
      displayName:
        currentAccount.display_name ?? currentAccount.username ?? '',
      avatar:
        currentAccount.avatar ??
        currentAccount.avatar_static ??
        '',
      encryptedTokenRef: '',
      lastUsedAt: new Date().toISOString(),
    };

    try {
      console.log('[DEBUG] ensureAccountStored -> registerAccount start');
      await dispatch(registerAccount(entry, token) as unknown as any);
      console.log('[DEBUG] ensureAccountStored -> registerAccount success');
    } catch (error) {
      console.error('Failed to register current account for multi-account storage:', error);
    } finally {
      storingAccountIdsRef.current.delete(accountId);
      console.log('[DEBUG] === ensureAccountStored END ===');
    }
  }, [accounts, currentAccount, dispatch]);

  useEffect(() => {
    void ensureAccountStored();
  }, [ensureAccountStored]);

  useEffect(() => {
    if (!accounts) {
      return;
    }

    const entries = accounts
      .toList()
      .map((entry: any) => (entry?.toJS ? entry.toJS() : entry))
      .filter((entry: any) => entry && entry.id);

    if (entries.length === 0) {
      return;
    }

    setPersistedAccounts((prev) => {
      const map = new Map<string, MultiAccountEntry>();
      prev.forEach((entry) => {
        if (entry?.id) {
          map.set(entry.id, entry);
        }
      });
      entries.forEach((entry: any) => {
        if (entry?.id) {
          map.set(entry.id, entry);
        }
      });
      return Array.from(map.values());
    });
  }, [accounts]);

  const handleOpenManageFromTrigger = useCallback(() => {
    setIsManageOpen(true);
  }, []);

  const handleCloseManage = useCallback(() => {
    setIsManageOpen(false);
    setPendingDeletion(null);
  }, []);

  useEffect(() => {
    if (!isManageOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleCloseManage();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isManageOpen, handleCloseManage]);

  const handleRequestDelete = useCallback((entry: MultiAccountEntry) => {
    setPendingDeletion(entry);
  }, []);

  const handleCancelDelete = useCallback(() => {
    setPendingDeletion(null);
  }, []);

  const handleConfirmDelete = useCallback(
    async (entry: MultiAccountEntry) => {
      if (!entry.id || deletingAccountId) {
        return;
      }

      setDeletingAccountId(entry.id);

      try {
        await dispatch(removeAccount(entry.id) as unknown as any);
        setPersistedAccounts((prev) =>
          prev.filter((stored) => stored.id && stored.id !== entry.id),
        );

        dispatch(
          showAlert({
            message: intl.formatMessage(messages.manageRemoveSuccess),
          }),
        );

        if (entry.id === activeAccountId) {
          try {
            await api(false).delete('/auth/sign_out', {
              headers: {
                Accept: 'application/json',
              },
            });
          } catch (signOutError) {
            console.error(
              'Failed to sign out after removing active account:',
              signOutError,
            );
            dispatch(
              showAlert({
                message: intl.formatMessage(messages.manageSignOutFailure),
              }),
            );
          } finally {
            window.location.reload();
          }
        }
      } catch (error) {
        console.error('Failed to remove account:', error);
        dispatch(
          showAlert({
            message: intl.formatMessage(messages.manageRemoveFailure),
          }),
        );
      } finally {
        setDeletingAccountId(null);
        setPendingDeletion(null);
      }
    },
    [
      dispatch,
      intl,
      messages.manageRemoveFailure,
      messages.manageRemoveSuccess,
      messages.manageSignOutFailure,
      activeAccountId,
      deletingAccountId,
    ],
  );

  const handleAddAccount = useCallback(() => {
    const add = async () => {
      const pending = { state: null as string | null, nonce: null as string | null };

      const currentAccountId = activeAccount?.id ?? currentAccount?.id ?? null;
      console.log('[DEBUG] === handleAddAccount START ===');
      console.log('[DEBUG] Current account ID:', currentAccountId);

      if (currentAccountId) {
        try {
          const encrypted = await loadEncryptedToken(currentAccountId);
          if (encrypted) {
            const token = await decryptToken(encrypted);
            const preview =
              typeof token === 'string' ? token.substring(0, 30) : 'N/A';
            console.log(
              '[DEBUG] Current stored token (first 30):',
              preview,
            );
          } else {
            console.log(
              '[DEBUG] No token stored yet for current account (no encrypted payload)',
            );
          }
        } catch (error) {
          console.log(
            '[DEBUG] No token stored yet for current account (decrypt/load failed):',
            error,
          );
        }
      } else {
        console.log('[DEBUG] Current account ID not resolved');
      }

      let restoreMultiAccountSessionFn:
        | MultiAccountsModule['restoreMultiAccountSession']
        | undefined;

      try {
        setIsProcessing(true);

        if (currentAccountId) {
          try {
            console.log('[MultiAccount] Pre-OAuth: refreshing current account token...');
            const response = await api().post<{
              token?: string;
              account?: {
                id?: string;
                acct?: string;
                username?: string;
                display_name?: string;
                avatar?: string;
                avatar_static?: string;
              };
              scope?: string;
              expires_at?: string | null;
            }>('/api/v1/multi_accounts/refresh_token');

            const { token, account } = response.data;

            if (token && account) {
              const refreshedEntry: MultiAccountEntry = {
                id: account.id ?? currentAccountId,
                acct:
                  account.acct ??
                  account.username ??
                  currentAccount?.acct ??
                  currentAccountId,
                displayName:
                  account.display_name ??
                  account.username ??
                  currentAccount?.display_name ??
                  currentAccount?.username ??
                  '',
                avatar:
                  account.avatar ??
                  account.avatar_static ??
                  currentAccount?.avatar ??
                  currentAccount?.avatar_static ??
                  '',
                encryptedTokenRef: '',
                lastUsedAt: new Date().toISOString(),
              };

              await dispatch(registerAccount(refreshedEntry, token) as unknown as any);
              console.log('[MultiAccount] Pre-OAuth: token refresh SUCCESS');
            } else {
              console.warn(
                '[MultiAccount] Pre-OAuth: response missing token or account data',
              );
            }
          } catch (refreshError) {
            console.error(
              '[MultiAccount] Pre-OAuth: token refresh FAILED',
              refreshError,
            );
          }
        }

        const [
          {
            fetchAuthorizeEntry,
            consumeAuthorizationCode,
            restoreMultiAccountSession,
          },
          { openOAuthPopup },
        ] = await Promise.all([
          loadMultiAccountsModule(),
          loadCallbackHandlerModule(),
        ]);

        restoreMultiAccountSessionFn = restoreMultiAccountSession;

        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;

        const blankPopup = window.open(
          'about:blank',
          'multi-account-oauth',
          `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no`,
        );

        if (!blankPopup) {
          throw new Error(
            intl.formatMessage({
              id: 'account_switcher.popup_blocked',
              defaultMessage: 'Popup was blocked. Please allow popups for this site.',
            }),
          );
        }

        const authorizeEntry = await fetchAuthorizeEntry();
        pending.state = authorizeEntry.state;
        pending.nonce = authorizeEntry.nonce;
        const { authorize_url: authorizeUrl, state, nonce } = authorizeEntry;

        const callback = await openOAuthPopup(authorizeUrl, state, blankPopup);

        const { token, account } = await consumeAuthorizationCode({
          state: callback.state,
          nonce,
          authorization_code: callback.code,
        });

        await ensureAccountStored();

        const accountEntry: MultiAccountEntry = {
          id: account.id,
          acct: account.acct,
          displayName: account.display_name || account.username,
          avatar: account.avatar || account.avatar_static,
          encryptedTokenRef: '',
          lastUsedAt: new Date().toISOString(),
        };

        await dispatch(
          registerAccount(accountEntry, token) as unknown as any,
        );
        await dispatch(switchAccount(accountEntry.id) as unknown as any);
      } catch (error) {
        console.error('Account registration failed:', error);

        if (pending.state && pending.nonce && restoreMultiAccountSessionFn) {
          try {
            await restoreMultiAccountSessionFn({
              state: pending.state,
              nonce: pending.nonce,
            });
          } catch (restoreError) {
            console.error('Failed to restore multi-account session:', restoreError);
          }
        }

        const knownMessage =
          error instanceof Error ? knownErrorMessages[error.message] : undefined;
        const message =
          knownMessage ??
          (error instanceof Error
            ? error.message
            : messages.addError);

        dispatch(showAlert({ message }));
      } finally {
        setIsProcessing(false);
      }
    };

    void add();
  }, [activeAccount, currentAccount, dispatch, ensureAccountStored, intl]);

  const handleLogOutAllAccounts = useCallback(() => {
    const logOutAll = async () => {
      if (isLoggingOutAll) {
        return;
      }

      setIsLoggingOutAll(true);

      try {
        await clearAllAccounts();
        clearActiveAccountIdInStorage();
        setPersistedAccounts([]);
        await logOut();
      } catch (error) {
        console.error('Failed to log out of all accounts:', error);
        dispatch(
          showAlert({
            message: intl.formatMessage(messages.manageLogoutAllError),
          }),
        );
      } finally {
        setIsLoggingOutAll(false);
      }
    };

    void logOutAll();
  }, [dispatch, intl, isLoggingOutAll, messages.manageLogoutAllError]);

  if (!currentAccount) {
    return null;
  }

  const renderManageModal = () => {
    if (!isManageOpen) {
      return null;
    }

    const handleOverlayClick = () => {
      handleCloseManage();
    };

    const stopPropagation = (event: ReactMouseEvent) => {
      event.stopPropagation();
    };

    const hasManagedAccounts = managedAccounts.length > 0;

    return createPortal(
      <div
        className='account-switcher__manage-overlay'
        role='dialog'
        aria-modal='true'
        aria-labelledby='account-switcher-manage-title'
        onClick={handleOverlayClick}
      >
        <div className='account-switcher__manage-modal' onClick={stopPropagation}>
          <div className='account-switcher__manage-header'>
            <button
              type='button'
              className='account-switcher__manage-close'
              onClick={handleCloseManage}
              aria-label={intl.formatMessage(messages.manageDeleteCancel)}
            >
              <Icon id='close' icon={CloseIcon} />
            </button>
            <h2 id='account-switcher-manage-title' className='account-switcher__manage-title'>
              {intl.formatMessage(messages.manageTitle)}
            </h2>
          </div>

          <div className='account-switcher__manage-list'>
            {managedAccounts.length === 0 ? (
              <div className='account-switcher__manage-empty'>
                {intl.formatMessage(messages.manageEmpty)}
              </div>
            ) : (
              managedAccounts.map((entry) => {
                const isActive = entry.id === activeAccountId;
                const isDeleting = deletingAccountId === entry.id;
                const canSwitch = !(isActive || isDeleting || isProcessing);

                const handleItemClick = () => {
                  if (!canSwitch) return;
                  void handleSwitchAccount(entry.id);
                };

                const handleItemKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
                  if (!canSwitch) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    void handleSwitchAccount(entry.id);
                  }
                };

                return (
                  <div
                    key={entry.id}
                    className={`account-switcher__manage-item${
                      isActive ? ' account-switcher__manage-item--active' : ''
                    }`}
                    role='button'
                    tabIndex={0}
                    onClick={handleItemClick}
                    onKeyDown={handleItemKeyDown}
                    aria-disabled={!canSwitch}
                  >
                    <img
                      src={entry.avatar || displayAvatar}
                      alt=''
                      className='account-switcher__manage-avatar'
                      draggable={false}
                    />
                    <div className='account-switcher__manage-info'>
                      <span className='account-switcher__manage-name'>
                        {entry.displayName || entry.acct || entry.id}
                      </span>
                      <span className='account-switcher__manage-handle'>
                        @{entry.acct || entry.id}
                      </span>
                    </div>
                    <div className='account-switcher__manage-actions'>
                      {isActive && (
                        <span className='account-switcher__manage-status' aria-hidden>
                          <Icon id='check' icon={CheckIcon} className='account-switcher__manage-check' />
                        </span>
                      )}
                      <button
                        type='button'
                        className='account-switcher__manage-action account-switcher__manage-action--danger'
                        onClick={(event) => {
                          event.stopPropagation();
                          handleRequestDelete(entry);
                        }}
                        disabled={isDeleting}
                        aria-label={intl.formatMessage(messages.manageDelete)}
                      >
                        <Icon id='delete' icon={DeleteIcon} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}

            {hasManagedAccounts && (
              <div
                className='account-switcher__manage-divider'
                aria-hidden='true'
              />
            )}

            <div className='account-switcher__manage-footer'>
              <button
                type='button'
                className='account-switcher__manage-footer-button account-switcher__manage-footer-button--ghost account-switcher__manage-footer-button--link'
                onClick={handleAddAccount}
                disabled={isProcessing || isLoggingOutAll}
              >
                {intl.formatMessage(messages.manageAddExisting)}
              </button>
              <button
                type='button'
                className='account-switcher__manage-footer-button account-switcher__manage-footer-button--ghost account-switcher__manage-footer-button--danger'
                onClick={handleLogOutAllAccounts}
                disabled={isProcessing || isLoggingOutAll}
              >
                {isLoggingOutAll ? (
                  <CircularProgress size={16} strokeWidth={3} />
                ) : (
                  intl.formatMessage(messages.manageLogoutAll)
                )}
              </button>
            </div>
          </div>
        </div>

        {pendingDeletion && (
          <div
            className='account-switcher__confirm-overlay'
            role='dialog'
            aria-modal='true'
            aria-labelledby='account-switcher-confirm-title'
            onClick={stopPropagation}
          >
            <div className='account-switcher__confirm-modal'>
              <h3 id='account-switcher-confirm-title'>
                {intl.formatMessage(messages.manageDeleteConfirmTitle, {
                  displayName:
                    pendingDeletion.displayName ||
                    pendingDeletion.acct ||
                    pendingDeletion.id,
                })}
              </h3>
              <p>{intl.formatMessage(messages.manageDeleteConfirmDescription)}</p>
              <div className='account-switcher__confirm-actions'>
                <button
                  type='button'
                  onClick={handleCancelDelete}
                  className='account-switcher__confirm-button'
                  disabled={deletingAccountId === pendingDeletion.id}
                >
                  {intl.formatMessage(messages.manageDeleteCancel)}
                </button>
                <button
                  type='button'
                  onClick={() => void handleConfirmDelete(pendingDeletion)}
                  className='account-switcher__confirm-button account-switcher__confirm-button--danger'
                  disabled={deletingAccountId === pendingDeletion.id}
                >
                  {deletingAccountId === pendingDeletion.id ? (
                    <CircularProgress size={14} strokeWidth={3} />
                  ) : (
                    intl.formatMessage(messages.manageDeleteConfirm)
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>,
      document.body,
    );
  };

  return (
    <>
      <div className='account-switcher navigation-panel__account-switcher'>
        <div className='account-switcher__trigger-wrapper'>
          {renderTrigger ? (
            renderTrigger({
              openManage: handleOpenManageFromTrigger,
            })
          ) : (
            <button
              type='button'
              className='account-switcher__trigger'
              onClick={handleOpenManageFromTrigger}
              aria-haspopup='dialog'
              aria-label={intl.formatMessage(messages.switchAccount)}
            >
              <img
                src={displayAvatar}
                alt=''
                className='account-switcher__trigger-avatar'
                draggable={false}
              />
              <div className='account-switcher__info'>
                <strong className='account-switcher__display-name'>
                  {displayName}
                </strong>
                <span className='account-switcher__username'>
                  @{displayAcct}
                </span>
              </div>
              <Icon id='more-horiz' icon={MoreHorizIcon} className='account-switcher__icon' />
            </button>
          )}
        </div>

      </div>

      {renderManageModal()}
    </>
  );
};


