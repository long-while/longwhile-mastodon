import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  FC,
  MouseEvent as ReactMouseEvent,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { defineMessages, useIntl } from 'react-intl';
import type { MessageDescriptor } from 'react-intl';

import { useSelector } from 'react-redux';

import CheckIcon from '@/material-icons/400-24px/check.svg?react';
import CloseIcon from '@/material-icons/400-24px/close.svg?react';
import DeleteIcon from '@/material-icons/400-24px/delete.svg?react';
import MoreHorizIcon from '@/material-icons/400-24px/more_horiz.svg?react';
import { showAlert } from 'mastodon/actions/alerts';
import {
  registerAccount,
  switchAccount,
  registerAccountAction,
  removeAccount,
} from 'mastodon/actions/multi_account';
import api, { suspendSessionRecovery } from 'mastodon/api';
import type * as MultiAccountsApi from 'mastodon/api/multi_accounts';
import { MULTI_ACCOUNT_REQUEST_TIMEOUT } from 'mastodon/api/multi_accounts_constants';
import { CircularProgress } from 'mastodon/components/circular_progress';
import { Icon } from 'mastodon/components/icon';
import type * as CallbackHandler from 'mastodon/features/multi_account/callback_handler';
import {
  closeBlankOAuthPopup,
  isIosHomeScreenApp,
  openBlankOAuthPopup,
} from 'mastodon/features/multi_account/oauth_popup';
import type { Account } from 'mastodon/models/account';
import { useAppDispatch } from 'mastodon/store/typed_functions';
import type { MultiAccountEntry } from 'mastodon/types/multi_account';
import { MultiAccountSwitchError } from 'mastodon/types/multi_account';
import { logOut } from 'mastodon/utils/log_out';
import { loadEncryptedToken } from 'mastodon/utils/multi_account_db';
import {
  loadLinkedEntries,
  loadLinkedEntriesDetailed,
  resetLinkedAccountIdsCache,
} from 'mastodon/utils/multi_account_links';
import type { LinkedEntriesResult } from 'mastodon/utils/multi_account_links';
import {
  getDismissedLinkNoticeCount,
  setDismissedLinkNoticeCount,
} from 'mastodon/utils/multi_account_storage';

import { AccountLinkNotice } from './account_switcher_link_notice';

const ADD_ACCOUNT_WATCHDOG_TIMEOUT = 100000;

type MultiAccountsModule = typeof MultiAccountsApi;
type CallbackHandlerModule = typeof CallbackHandler;

const loadMultiAccountsModule = (): Promise<MultiAccountsModule> =>
  import('mastodon/api/multi_accounts');

const loadCallbackHandlerModule = (): Promise<CallbackHandlerModule> =>
  import('mastodon/features/multi_account/callback_handler');

const pageTokenWasRevoked = async (): Promise<boolean> => {
  try {
    await api().get('/api/v1/accounts/verify_credentials', {
      timeout: MULTI_ACCOUNT_REQUEST_TIMEOUT,
    });
    return false;
  } catch (error) {
    return (
      (error as { response?: { status?: number } }).response?.status === 401
    );
  }
};

const messages = defineMessages({
  switchAccount: {
    id: 'account_switcher.switch_account',
    defaultMessage: 'Switch account',
  },
  addAccount: {
    id: 'account_switcher.add_account',
    defaultMessage: 'Add another account',
  },
  addingAccount: {
    id: 'account_switcher.adding_account',
    defaultMessage: 'Adding account...',
  },
  addError: {
    id: 'account_switcher.add_error',
    defaultMessage: 'Failed to add account.',
  },
  switchError: {
    id: 'account_switcher.switch_error',
    defaultMessage: 'Failed to switch account.',
  },
  popupBlocked: {
    id: 'account_switcher.popup_blocked',
    defaultMessage: 'Popup was blocked. Please allow popups for this site.',
  },
  popupLoading: {
    id: 'account_switcher.popup_loading',
    defaultMessage: 'Loading the login screen…',
  },
  homeScreenAppUnsupported: {
    id: 'account_switcher.home_screen_app_unsupported',
    defaultMessage:
      'Accounts cannot be added from the Home Screen app. Please open this site in Safari to add an account.',
  },
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
    defaultMessage:
      'Deleting this account will remove saved login data and sign it out on this device.',
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
    defaultMessage:
      'Account was removed locally, but signing out on the server failed.',
  },
  manageLogoutAll: {
    id: 'account_switcher.manage_logout_all',
    defaultMessage: 'Log out of all accounts',
  },
  manageLogoutAllError: {
    id: 'account_switcher.manage_logout_all_error',
    defaultMessage: 'Failed to log out of all accounts. Please try again.',
  },
  manageCancelAdd: {
    id: 'account_switcher.cancel_add',
    defaultMessage: 'Cancel',
  },
  addTimeout: {
    id: 'account_switcher.add_timeout',
    defaultMessage:
      'Adding an account took too long and was cancelled. Please try again.',
  },
});

interface AccountSwitcherTriggerArgs {
  openManage: () => void;
}

interface AccountSwitcherProps {
  renderTrigger?: (options: AccountSwitcherTriggerArgs) => ReactNode;
}
const firstNonEmpty = (...values: (string | null | undefined)[]): string =>
  values.find((value) => !!value && value.length > 0) ?? '';

const OAUTH_POPUP_CLOSED =
  'OAuth popup was closed before authorization completed';

const knownErrorMessages: Record<string, MessageDescriptor> = {
  [OAUTH_POPUP_CLOSED]: messages.oauthPopupClosed,
};

export const AccountSwitcher: FC<AccountSwitcherProps> = ({
  renderTrigger,
}) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoggingOutAll, setIsLoggingOutAll] = useState(false);
  const isProcessingRef = useRef(false);
  const addWatchdogRef = useRef<number | null>(null);
  const addPopupRef = useRef<Window | null>(null);
  const addFlowRef = useRef(0);
  const storingAccountIdsRef = useRef<Set<string>>(new Set());
  const mintAttemptedIdsRef = useRef<Set<string>>(new Set());
  const [persistedAccounts, setPersistedAccounts] = useState<
    MultiAccountEntry[]
  >([]);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [linkStatus, setLinkStatus] = useState({
    droppedCount: 0,
    linksFailed: false,
  });
  const [dismissedNoticeCount, setDismissedNoticeCount] = useState(
    getDismissedLinkNoticeCount,
  );
  const [pendingDeletion, setPendingDeletion] =
    useState<MultiAccountEntry | null>(null);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(
    null,
  );

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
      if (typeof multiAccountState.get === 'function') {
        return multiAccountState.get(key);
      }
      return multiAccountState[key] ?? null;
    },
    [multiAccountState],
  );

  const activeAccountId = readMultiAccountValue('activeAccountId');
  const accounts = readMultiAccountValue('accounts');

  // Get current user account
  const currentAccount = useSelector((state: any) =>
    state.getIn(['accounts', state.getIn(['meta', 'me'])]),
  ) as Account | undefined;

  const sessionAccountId: string | null =
    currentAccount?.id ?? (activeAccountId as string | null) ?? null;

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

  const applyLinkedEntries = useCallback((result: LinkedEntriesResult) => {
    setPersistedAccounts(Object.values(result.entries));
    setLinkStatus({
      droppedCount: result.droppedCount,
      linksFailed: result.linksFailed,
    });
  }, []);

  useEffect(() => {
    void loadLinkedEntriesDetailed()
      .then(applyLinkedEntries)
      .catch((error: unknown) => {
        console.error('Failed to load persisted multi-account entries:', error);
      });
  }, [applyLinkedEntries]);

  const handleDismissLinkNotice = useCallback(() => {
    setDismissedLinkNoticeCount(linkStatus.droppedCount);
    setDismissedNoticeCount(linkStatus.droppedCount);
  }, [linkStatus.droppedCount]);

  useEffect(() => {
    return () => {
      if (addWatchdogRef.current !== null) {
        window.clearTimeout(addWatchdogRef.current);
        addWatchdogRef.current = null;
      }
    };
  }, []);

  const activeEntry = useMemo(() => {
    if (!sessionAccountId || !accounts) {
      return null;
    }

    if (typeof accounts.get === 'function') {
      return accounts.get(sessionAccountId);
    }

    return accounts[sessionAccountId] ?? null;
  }, [sessionAccountId, accounts]);

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

  const mergedAccounts = useMemo(() => {
    const map = new Map<string, MultiAccountEntry>();

    persistedAccounts.forEach((entry) => {
      if (entry?.id) {
        map.set(entry.id, entry);
      }
    });

    if (accounts) {
      const iterate =
        typeof accounts.toList === 'function'
          ? accounts.toList()
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
        const aIsActive = a.id === sessionAccountId;
        const bIsActive = b.id === sessionAccountId;

        if (aIsActive && !bIsActive) return -1;
        if (!aIsActive && bIsActive) return 1;

        const nameA = (a.displayName || a.acct || a.id || '').toLowerCase();
        const nameB = (b.displayName || b.acct || b.id || '').toLowerCase();
        if (nameA < nameB) return 1;
        if (nameA > nameB) return -1;
        return 0;
      })
      .slice(0, 10);
  }, [mergedAccounts, sessionAccountId]);

  const ensureAccountRegistered = useCallback(
    async (accountId: string) => {
      const accountExists =
        !!accounts &&
        (typeof accounts.has === 'function'
          ? accounts.has(accountId)
          : Boolean(accounts[accountId]));

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
        const storedEntries = await loadLinkedEntries();
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
          throw new Error('해당 계정을 불러오지 못했습니다.');
        }

        await dispatch(switchAccount(accountId) as unknown as any);
      } catch (error) {
        console.error(error);

        if (error instanceof MultiAccountSwitchError && error.isDeadToken) {
          const deadEntry =
            managedAccounts.find((candidate) => candidate.id === accountId) ??
            mergedAccounts.find((candidate) => candidate.id === accountId) ??
            null;

          if (deadEntry) {
            setIsManageOpen(true);
            setPendingDeletion(deadEntry);
          }

          dispatch(showAlert({ message: error.message }));
          return;
        }

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
    [dispatch, ensureAccountRegistered, intl, managedAccounts, mergedAccounts],
  );

  const hasOtherStoredAccounts = useMemo(
    () =>
      mergedAccounts.some(
        (entry) => !!entry.id && entry.id !== currentAccount?.id,
      ),
    [mergedAccounts, currentAccount],
  );

  const ensureAccountStored = useCallback(async () => {
    if (!currentAccount) {
      return;
    }

    const accountId = currentAccount.id;

    if (!hasOtherStoredAccounts) {
      return;
    }

    if (
      storingAccountIdsRef.current.has(accountId) ||
      mintAttemptedIdsRef.current.has(accountId)
    ) {
      return;
    }

    storingAccountIdsRef.current.add(accountId);
    mintAttemptedIdsRef.current.add(accountId);

    try {
      const existingEncrypted = await loadEncryptedToken(accountId);
      if (existingEncrypted) {
        storingAccountIdsRef.current.delete(accountId);
        return;
      }
    } catch {}

    try {
      const { mintSwitchToken } = await loadMultiAccountsModule();
      const minted = await mintSwitchToken(accountId);

      if (!minted) {
        return;
      }

      const entry: MultiAccountEntry = {
        id: minted.account.id,
        acct: firstNonEmpty(
          minted.account.acct,
          currentAccount.acct,
          currentAccount.username,
        ),
        displayName: firstNonEmpty(
          minted.account.display_name,
          minted.account.username,
          currentAccount.display_name,
          currentAccount.username,
        ),
        avatar: firstNonEmpty(
          minted.account.avatar,
          minted.account.avatar_static,
          currentAccount.avatar,
          currentAccount.avatar_static,
        ),
        encryptedTokenRef: '',
        lastUsedAt: new Date().toISOString(),
      };

      await dispatch(registerAccount(entry, minted.token) as unknown as any);
    } catch (error) {
      console.error(
        'Failed to store a switch token for the current account:',
        error,
      );
    } finally {
      storingAccountIdsRef.current.delete(accountId);
    }
  }, [currentAccount, dispatch, hasOtherStoredAccounts]);

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
      .filter((entry: any) => entry?.id);

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

  useEffect(() => {
    if (!isManageOpen) {
      return;
    }

    void loadLinkedEntriesDetailed()
      .then(applyLinkedEntries)
      .catch((error: unknown) => {
        console.error(
          'Failed to refresh persisted multi-account entries:',
          error,
        );
      });
  }, [isManageOpen, applyLinkedEntries]);

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

        if (entry.id === sessionAccountId) {
          try {
            await api(false).delete('/auth/sign_out', {
              headers: {
                Accept: 'application/json',
              },
              timeout: MULTI_ACCOUNT_REQUEST_TIMEOUT,
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
    [dispatch, intl, sessionAccountId, deletingAccountId],
  );

  const finishAddProcessing = useCallback(() => {
    isProcessingRef.current = false;
    if (addWatchdogRef.current !== null) {
      window.clearTimeout(addWatchdogRef.current);
      addWatchdogRef.current = null;
    }
    setIsProcessing(false);
  }, []);

  const handleCancelAddAccount = useCallback(() => {
    addFlowRef.current += 1;
    closeBlankOAuthPopup(addPopupRef.current);
    void loadCallbackHandlerModule().then(({ cancelPendingOAuthRequests }) => {
      cancelPendingOAuthRequests();
    });
    finishAddProcessing();
  }, [finishAddProcessing]);

  const handleAddAccount = useCallback(() => {
    if (isProcessingRef.current) {
      return;
    }

    if (isIosHomeScreenApp()) {
      dispatch(showAlert({ message: messages.homeScreenAppUnsupported }));
      return;
    }

    const popup = openBlankOAuthPopup(
      intl.formatMessage(messages.popupLoading),
    );

    if (!popup) {
      dispatch(showAlert({ message: messages.popupBlocked }));
      return;
    }

    addPopupRef.current = popup;

    const flowId = ++addFlowRef.current;
    const isStale = () => addFlowRef.current !== flowId;

    const add = async () => {
      isProcessingRef.current = true;
      setIsProcessing(true);

      const handleWatchdog = () => {
        console.warn(
          '[MultiAccount] add-account watchdog fired; force-releasing UI state',
        );
        addFlowRef.current += 1;
        void loadCallbackHandlerModule().then(
          ({ cancelPendingOAuthRequests }) => {
            cancelPendingOAuthRequests();
          },
        );
        closeBlankOAuthPopup(popup);
        finishAddProcessing();
        dispatch(
          showAlert({ message: intl.formatMessage(messages.addTimeout) }),
        );
      };

      const armWatchdog = () => {
        if (addWatchdogRef.current !== null) {
          window.clearTimeout(addWatchdogRef.current);
        }
        addWatchdogRef.current = window.setTimeout(
          handleWatchdog,
          ADD_ACCOUNT_WATCHDOG_TIMEOUT,
        );
      };

      armWatchdog();

      const pending = {
        state: null as string | null,
        nonce: null as string | null,
      };

      const currentAccountId = sessionAccountId;

      let restoreMultiAccountSessionFn:
        | MultiAccountsModule['restoreMultiAccountSession']
        | undefined;

      let releaseSessionRecovery: (() => void) | null = null;
      let reloading = false;
      let mintPromise: Promise<void> = Promise.resolve();

      try {
        const mintCurrentAccountToken = async () => {
          if (currentAccountId) {
            try {
              const { mintSwitchToken } = await loadMultiAccountsModule();
              const minted = await mintSwitchToken(currentAccountId);

              if (minted) {
                const refreshedEntry: MultiAccountEntry = {
                  id: minted.account.id,
                  acct: firstNonEmpty(
                    minted.account.acct,
                    currentAccount?.acct,
                    currentAccount?.username,
                    currentAccountId,
                  ),
                  displayName: firstNonEmpty(
                    minted.account.display_name,
                    minted.account.username,
                    currentAccount?.display_name,
                    currentAccount?.username,
                  ),
                  avatar: firstNonEmpty(
                    minted.account.avatar,
                    minted.account.avatar_static,
                    currentAccount?.avatar,
                    currentAccount?.avatar_static,
                  ),
                  encryptedTokenRef: '',
                  lastUsedAt: new Date().toISOString(),
                };

                await dispatch(
                  registerAccount(
                    refreshedEntry,
                    minted.token,
                  ) as unknown as any,
                );
                mintAttemptedIdsRef.current.add(currentAccountId);
              }
            } catch (refreshError) {
              console.error(
                '[MultiAccount] Pre-OAuth: token refresh FAILED',
                refreshError,
              );
            }
          }
        };

        mintPromise = mintCurrentAccountToken();

        const [
          ,
          { consumeAuthorizationCode, restoreMultiAccountSession },
          { openOAuthPopup },
          authorizeEntry,
        ] = await Promise.all([
          mintPromise,
          loadMultiAccountsModule(),
          loadCallbackHandlerModule(),
          loadMultiAccountsModule().then((module) =>
            module.fetchAuthorizeEntry({ forceLogin: true }),
          ),
        ]);

        restoreMultiAccountSessionFn = restoreMultiAccountSession;
        pending.state = authorizeEntry.state;
        pending.nonce = authorizeEntry.nonce;
        const { authorize_url: authorizeUrl, state, nonce } = authorizeEntry;

        if (isStale() || popup.closed) {
          throw new Error(OAUTH_POPUP_CLOSED);
        }

        releaseSessionRecovery = suspendSessionRecovery();
        armWatchdog();

        const callback = await openOAuthPopup(authorizeUrl, state, popup);

        const { token, account } = await consumeAuthorizationCode({
          state: callback.state,
          nonce,
          authorization_code: callback.code,
        });

        resetLinkedAccountIdsCache();

        const accountEntry: MultiAccountEntry = {
          id: account.id,
          acct: account.acct,
          displayName: account.display_name || account.username,
          avatar: account.avatar || account.avatar_static,
          encryptedTokenRef: '',
          lastUsedAt: new Date().toISOString(),
        };

        await dispatch(registerAccount(accountEntry, token) as unknown as any);
        await dispatch(switchAccount(accountEntry.id) as unknown as any);
        reloading = true;
      } catch (error) {
        console.error('Account registration failed:', error);

        await mintPromise;

        closeBlankOAuthPopup(popup);

        if (
          releaseSessionRecovery &&
          pending.state &&
          pending.nonce &&
          restoreMultiAccountSessionFn
        ) {
          try {
            await restoreMultiAccountSessionFn({
              state: pending.state,
              nonce: pending.nonce,
            });
          } catch (restoreError) {
            console.error(
              'Failed to restore multi-account session:',
              restoreError,
            );
          }
        }

        if (releaseSessionRecovery && (await pageTokenWasRevoked())) {
          reloading = true;
          window.location.reload();
          return;
        }

        const knownMessage =
          error instanceof Error
            ? knownErrorMessages[error.message]
            : undefined;
        const message =
          knownMessage ??
          (error instanceof Error ? error.message : messages.addError);

        if (!isStale()) {
          dispatch(showAlert({ message }));
        }
      } finally {
        if (!reloading) {
          releaseSessionRecovery?.();
        }

        if (!isStale()) {
          addPopupRef.current = null;
          finishAddProcessing();
        }
      }
    };

    void add();
  }, [currentAccount, dispatch, finishAddProcessing, intl, sessionAccountId]);

  const handleLogOutAllAccounts = useCallback(() => {
    const logOutAll = async () => {
      if (isLoggingOutAll) {
        return;
      }

      setIsLoggingOutAll(true);

      try {
        await logOut({ forgetSavedAccounts: true });
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
  }, [dispatch, intl, isLoggingOutAll]);

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
    const showLinkNotice =
      linkStatus.droppedCount > 0 &&
      (linkStatus.linksFailed ||
        linkStatus.droppedCount > dismissedNoticeCount);

    return createPortal(
      <div
        className='account-switcher__manage-overlay'
        role='dialog'
        aria-modal='true'
        aria-labelledby='account-switcher-manage-title'
        onClick={handleOverlayClick}
      >
        <div
          className='account-switcher__manage-modal'
          onClick={stopPropagation}
        >
          <div className='account-switcher__manage-header'>
            <button
              type='button'
              className='account-switcher__manage-close'
              onClick={handleCloseManage}
              aria-label={intl.formatMessage(messages.manageDeleteCancel)}
            >
              <Icon id='close' icon={CloseIcon} />
            </button>
            <h2
              id='account-switcher-manage-title'
              className='account-switcher__manage-title'
            >
              {intl.formatMessage(messages.manageTitle)}
            </h2>
          </div>

          {showLinkNotice && (
            <AccountLinkNotice
              droppedCount={linkStatus.droppedCount}
              linksFailed={linkStatus.linksFailed}
              onDismiss={handleDismissLinkNotice}
            />
          )}

          <div className='account-switcher__manage-list'>
            {managedAccounts.length === 0 ? (
              <div className='account-switcher__manage-empty'>
                {intl.formatMessage(messages.manageEmpty)}
              </div>
            ) : (
              managedAccounts.map((entry) => {
                const isCurrentLoggedIn = entry.id === currentAccount.id;
                const isDeleting = deletingAccountId === entry.id;
                const canSwitch = !(
                  isCurrentLoggedIn ||
                  isDeleting ||
                  isProcessing
                );

                const handleItemClick = () => {
                  if (!canSwitch) return;
                  void handleSwitchAccount(entry.id);
                };

                const handleItemKeyDown = (
                  event: ReactKeyboardEvent<HTMLDivElement>,
                ) => {
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
                      isCurrentLoggedIn
                        ? ' account-switcher__manage-item--active'
                        : ''
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
                      {isCurrentLoggedIn && (
                        <span
                          className='account-switcher__manage-status'
                          aria-hidden
                        >
                          <Icon
                            id='check'
                            icon={CheckIcon}
                            className='account-switcher__manage-check'
                          />
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
              {isProcessing ? (
                <button
                  type='button'
                  className='account-switcher__manage-footer-button account-switcher__manage-footer-button--ghost account-switcher__manage-footer-button--link'
                  onClick={handleCancelAddAccount}
                >
                  <CircularProgress size={16} strokeWidth={3} />
                  {intl.formatMessage(messages.manageCancelAdd)}
                </button>
              ) : (
                <button
                  type='button'
                  className='account-switcher__manage-footer-button account-switcher__manage-footer-button--ghost account-switcher__manage-footer-button--link'
                  onClick={handleAddAccount}
                  disabled={isLoggingOutAll}
                >
                  {intl.formatMessage(messages.manageAddExisting)}
                </button>
              )}
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
              <p>
                {intl.formatMessage(messages.manageDeleteConfirmDescription)}
              </p>
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
              <Icon
                id='more-horiz'
                icon={MoreHorizIcon}
                className='account-switcher__icon'
              />
            </button>
          )}
        </div>
      </div>

      {renderManageModal()}
    </>
  );
};
