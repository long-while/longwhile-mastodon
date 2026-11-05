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
// 타입만 가져온다. 실제 모듈은 아래에서 `import()` 로 늦게 불러온다.
import { useAppDispatch } from 'mastodon/store/typed_functions';
import type { MultiAccountEntry } from 'mastodon/types/multi_account';
import { MultiAccountSwitchError } from 'mastodon/types/multi_account';
import { logOut } from 'mastodon/utils/log_out';
import {
  clearAllAccounts,
  loadAllEntries,
  loadEncryptedToken,
} from 'mastodon/utils/multi_account_db';
import { clearActiveAccountIdInStorage } from 'mastodon/utils/multi_account_storage';

// add-account 전체 흐름의 안전망(backstop). 개별 api 호출(15s)·OAuth 팝업(90s)
// 타임아웃을 모두 넘기는 예기치 못한 hang에 대비해 UI 플래그를 강제 해제한다.
const ADD_ACCOUNT_WATCHDOG_TIMEOUT = 100000;

type MultiAccountsModule = typeof MultiAccountsApi;
type CallbackHandlerModule = typeof CallbackHandler;

const loadMultiAccountsModule = (): Promise<MultiAccountsModule> =>
  import('mastodon/api/multi_accounts');

const loadCallbackHandlerModule = (): Promise<CallbackHandlerModule> =>
  import('mastodon/features/multi_account/callback_handler');

// 팝업의 `prompt=login` 이 공유 세션을 로그아웃시키면 이 페이지가 들고 있던
// 토큰도 함께 폐기된다. 흐름이 실패로 끝났을 때 그 토큰이 아직 쓸 만한지 본다.
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
// 빈 문자열은 값이 있는 것으로 치지 않는다. `??` 는 `''` 를 통과시켜
// 표시명이 비어 있는 계정이 목록에서 빈칸으로 보였다.
const firstNonEmpty = (...values: (string | null | undefined)[]): string =>
  values.find((value) => !!value && value.length > 0) ?? '';

// callback_handler.ts 가 팝업이 닫혔을 때 던지는 문구와 같아야 한다.
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
  // ref 기반 재진입 가드: isProcessing state는 클로저에서 stale 할 수 있어
  // 동시 실행 방지에는 ref를 사용한다.
  const isProcessingRef = useRef(false);
  const addWatchdogRef = useRef<number | null>(null);
  // 계정 추가 중에 열어 둔 팝업. 취소하면 아직 빈 창일 때 닫는다.
  const addPopupRef = useRef<Window | null>(null);
  // 지금 살아 있는 계정 추가 흐름의 번호. 취소·워치독이 올리면 그 전 흐름은
  // 계속 돌더라도 UI(알림·처리 중 표시)를 건드리지 못한다. 안 그러면 취소한
  // 뒤에 "팝업이 닫혔습니다" 가 뜨고, 그사이 새로 시작한 흐름의 상태까지 옛
  // 흐름의 마무리가 풀어 버린다.
  const addFlowRef = useRef(0);
  const storingAccountIdsRef = useRef<Set<string>>(new Set());
  // 장기 토큰 발급을 이번 페이지에서 이미 시도한 계정들.
  const mintAttemptedIdsRef = useRef<Set<string>>(new Set());
  const [persistedAccounts, setPersistedAccounts] = useState<
    MultiAccountEntry[]
  >([]);
  const [isManageOpen, setIsManageOpen] = useState(false);
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

  // @_longwhile — 이 화면에서 "현재 계정" 은 **서버 세션이 정한 계정** 하나다.
  //   `activeAccountId` 는 로컬에 적어 둔 힌트라 세션과 어긋날 수 있고, 그때
  //   둘을 섞어 쓰면 초록 체크가 두 계정에 찍히고 두 줄 다 전환이 막혔다.
  //   세션을 아직 모를 때(부팅 직후)만 힌트로 버틴다.
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

  useEffect(() => {
    void loadAllEntries()
      .then((entries) => {
        setPersistedAccounts(Object.values(entries));
      })
      .catch((error: unknown) => {
        console.error('Failed to load persisted multi-account entries:', error);
      });
  }, []);

  // 언마운트 시 add-account 워치독 타이머 정리(언마운트 후 setState 방지).
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
          throw new Error('해당 계정을 불러오지 못했습니다.');
        }

        await dispatch(switchAccount(accountId) as unknown as any);
      } catch (error) {
        console.error(error);

        // 저장된 토큰이 죽은(만료·폐기·복호화 불가) 계정이면 원시 에러만 띄우지 말고,
        // 관리 모달을 열어 해당 항목을 제거하도록 유도한다. 로케일 문자열 매칭이 아니라
        // 구조화된 에러 코드로 판별한다.
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

  // 이 브라우저에서 계정 전환을 실제로 쓰고 있는가.
  const hasOtherStoredAccounts = useMemo(
    () =>
      mergedAccounts.some(
        (entry) => !!entry.id && entry.id !== currentAccount?.id,
      ),
    [mergedAccounts, currentAccount],
  );

  // @_longwhile — **지금 로그인된 계정을 나중에 전환해 돌아올 수 있게** 만든다.
  //
  //   예전에는 여기서 페이지의 세션 토큰(`getAccessToken()`)을 그대로
  //   저장했다. 그런데 그건 `SessionActivation` 이 **웹 superapp** 으로 만든
  //   토큰이라 `long_lived`·`purpose`·`multi_account` 가 전부 비어 있고,
  //   `MultiAccounts::RefreshService#ensure_refresh_token_valid!` 가 **422** 로 막는다.
  //   그래서 그 계정 줄을 누를 때마다 "저장된 계정 토큰이 만료되었거나
  //   사용할 수 없습니다" 만 나왔다 — 토큰이 죽은 게 아니라 **종류가 틀린** 것이다.
  //   전환에 쓸 수 있는 토큰은 `mintSwitchToken()` 으로만 만든다.
  //
  //   판단 기준은 **IndexedDB 에 실제 토큰이 있느냐** 하나다. redux 의
  //   `accounts` 는 `hydrateStore` 가 세션 계정을 항상 끼워 넣으므로
  //   "항목이 있다" 가 "토큰이 있다" 를 뜻하지 않는다.
  const ensureAccountStored = useCallback(async () => {
    if (!currentAccount) {
      return;
    }

    const accountId = currentAccount.id;

    // 계정이 하나뿐인 사람에게까지 10년짜리 토큰을 쥐여 줄 이유가 없다.
    // 그 경우 첫 토큰은 `handleAddAccount` 가 팝업 직전에 받아 둔다.
    // 표식(`mintAttemptedIdsRef`)을 여기서 남기지 않는 게 중요하다 — 저장된
    // 항목은 비동기로 늦게 도착하므로 나중에 다시 들어와야 한다.
    if (!hasOtherStoredAccounts) {
      return;
    }

    if (
      storingAccountIdsRef.current.has(accountId) ||
      mintAttemptedIdsRef.current.has(accountId)
    ) {
      return;
    }

    // 표식은 **첫 비동기 작업 전에** 남긴다. 아래 `await` 뒤에 두면 두 번째
    // 호출(React 18 StrictMode 는 이펙트를 두 번 돌린다)가 같은 점검을 통과해
    // 발급을 두 번 시도한다. 서버가 같은 토큰을 돌려주므로 틀진 않지만,
    // 쓸데없는 요청이 한 번 더 나간다.
    storingAccountIdsRef.current.add(accountId);
    // 발급은 페이지당 한 번만 시도한다. 실패할 때마다 다시 부르면 쓰지도
    // 않을 10년짜리 토큰만 계속 쌓인다.
    mintAttemptedIdsRef.current.add(accountId);

    try {
      const existingEncrypted = await loadEncryptedToken(accountId);
      if (existingEncrypted) {
        storingAccountIdsRef.current.delete(accountId);
        return;
      }
    } catch {
      // 읽지 못했다 — 아래에서 새로 발급받아 채운다.
    }

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

  // 관리 모달을 열 때마다 저장된 항목을 다시 읽어 표시명·아바타를 최신 상태로 유지한다.
  useEffect(() => {
    if (!isManageOpen) {
      return;
    }

    void loadAllEntries()
      .then((entries) => {
        setPersistedAccounts(Object.values(entries));
      })
      .catch((error: unknown) => {
        console.error(
          'Failed to refresh persisted multi-account entries:',
          error,
        );
      });
  }, [isManageOpen]);

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

  // add-account 흐름이 끝나면(성공/실패/취소/워치독) UI 플래그와 워치독을 해제.
  const finishAddProcessing = useCallback(() => {
    isProcessingRef.current = false;
    if (addWatchdogRef.current !== null) {
      window.clearTimeout(addWatchdogRef.current);
      addWatchdogRef.current = null;
    }
    setIsProcessing(false);
  }, []);

  // 사용자가 계정 추가를 수동 취소: 진행 중인 OAuth 팝업을 닫고 UI를 즉시 복구.
  const handleCancelAddAccount = useCallback(() => {
    addFlowRef.current += 1;
    // 아직 준비 중이면(인가 화면 전) 팝업이 `pendingRequests` 에 없어서 아래가
    // 닫지 못한다. 빈 창은 여기서 닫는다.
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

    // 팝업은 **여기서, 동기로** 연다. `await` 뒤에 열면 iOS 사파리가 막는다
    // (features/multi_account/oauth_popup.ts).
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

      // 안전망: 모든 개별 타임아웃(api 15s · OAuth 팝업 90s)을 넘기는 예기치 못한
      // hang에도 UI가 영구히 잠기지 않도록 흐름 진입 즉시 워치독을 건다.
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

      // 로그인 화면으로 넘길 때 **다시 건다.** 팝업의 90초는 그때부터 세는데,
      // 처음에 건 100초를 그대로 두면 준비 단계(토큰 발급 등, 모바일에서 10초
      // 넘게 걸리기도 한다)만큼 먼저 터져 로그인 중인 창을 닫아 버린다.
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

      // 지금 서버 세션이 누구인지가 기준이다.
      const currentAccountId = sessionAccountId;

      let restoreMultiAccountSessionFn:
        | MultiAccountsModule['restoreMultiAccountSession']
        | undefined;

      // 팝업을 띄운 뒤로는 이 페이지의 토큰이 언제든 죽을 수 있다
      // (`suspendSessionRecovery` 참고). 새로고침으로 끝나는 경로에서는 풀지 않는다.
      let releaseSessionRecovery: (() => void) | null = null;
      let reloading = false;
      // 실패해도 이것이 끝날 때까지는 기다린다. 안 그러면 사용자가 곧바로 다시
      // 시도할 때 앞의 `registerAccount` 쓰기가 아직 돌고 있다.
      let mintPromise: Promise<void> = Promise.resolve();

      try {
        // @_longwhile — 팝업을 인가 화면으로 넘기기 **전에** 지금 계정의 장기 토큰을 다시
        //   받아 덮어쓴다. 이게 **예전 버전이 저장해 둔 세션 토큰을 고치는
        //   유일한 경로**라, 이미 항목이 있어도 건너뛰지 않는다. 곧 뒤에
        //   팝업의 `prompt=login` 이 공유 세션을 로그아웃시키므로,
        //   지금이 이 계정으로 토큰을 받을 수 있는 마지막 순간이기도 하다.
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

        // 장기 토큰 발급과 인가 주소 받기는 **서로 무관해서** 함께 돌린다
        // (`/multi_accounts/entry` 는 state 를 Redis 에 적을 뿐 세션을 건드리지
        // 않는다). 그동안 팝업은 "불러오는 중" 으로 기다리므로 짧을수록 좋다 —
        // iOS 에서는 팝업이 새 탭으로 열려 이 페이지가 뒤로 밀려 있다.
        const [
          ,
          { consumeAuthorizationCode, restoreMultiAccountSession },
          { openOAuthPopup },
          authorizeEntry,
        ] = await Promise.all([
          mintPromise,
          loadMultiAccountsModule(),
          loadCallbackHandlerModule(),
          // 새 계정 추가 시에는 반드시 로그인 화면을 강제한다. 그렇지 않으면
          // OAuth가 현재 세션 쿠키의 계정을 그대로 재인가해 "이미 로그인된
          // 계정"을 추가하게 된다.
          loadMultiAccountsModule().then((module) =>
            module.fetchAuthorizeEntry({ forceLogin: true }),
          ),
        ]);

        restoreMultiAccountSessionFn = restoreMultiAccountSession;
        pending.state = authorizeEntry.state;
        pending.nonce = authorizeEntry.nonce;
        const { authorize_url: authorizeUrl, state, nonce } = authorizeEntry;

        // 기다리는 동안 사용자가 빈 팝업을 닫았거나 취소를 눌렀다. 여기서 멈춰야
        // 팝업 없이 로그아웃만 일어나는 일이 없다.
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

        const accountEntry: MultiAccountEntry = {
          id: account.id,
          acct: account.acct,
          displayName: account.display_name || account.username,
          avatar: account.avatar || account.avatar_static,
          encryptedTokenRef: '',
          lastUsedAt: new Date().toISOString(),
        };

        await dispatch(registerAccount(accountEntry, token) as unknown as any);
        // 성공하면 `switchAccount` 가 새로고침한다.
        await dispatch(switchAccount(accountEntry.id) as unknown as any);
        reloading = true;
      } catch (error) {
        console.error('Account registration failed:', error);

        // 스스로 오류를 삼키므로 거절되지 않는다.
        await mintPromise;

        // 인가 화면으로 넘어가기 전에 실패했으면 "불러오는 중" 창이 남는다.
        closeBlankOAuthPopup(popup);

        // 복원은 팝업을 인가 화면으로 넘긴 뒤에만 필요하다 — 그 전에는 아무도
        // 로그아웃시키지 않았다. (`releaseSessionRecovery` 가 그 경계다.)
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

        // 팝업이 이미 로그아웃시켰다면 이 페이지의 토큰은 죽었고, 세션은
        // 복원됐든(원래 계정) 팝업에서 로그인했든 새 토큰을 들고 있다. 이대로
        // 두면 모든 요청이 401 이므로 새로고침해서 화면을 세션에 맞춘다.
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

        // 취소했거나 워치독이 이미 알렸으면 덧붙이지 않는다.
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

          <div className='account-switcher__manage-list'>
            {managedAccounts.length === 0 ? (
              <div className='account-switcher__manage-empty'>
                {intl.formatMessage(messages.manageEmpty)}
              </div>
            ) : (
              managedAccounts.map((entry) => {
                // @_longwhile — **'현재 계정' 은 서버 세션이 정한다.**
                //   `activeAccountId` 는 로컬에 적어 둔 힌트라 세션과 어긋날 수
                //   있고, 그때 둘 다 체크되면(초록 체크 두 개) 두 줄 모두
                //   전환이 막혀 아무 데로도 갈 수 없었다.
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
