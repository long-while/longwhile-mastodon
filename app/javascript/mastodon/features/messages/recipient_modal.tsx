// @_longwhile custom feature

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import classNames from 'classnames';

import { isCancel } from 'axios';
import { useDebouncedCallback } from 'use-debounce';

import ArrowBackIcon from '@/material-icons/400-24px/arrow_back.svg?react';
import CheckIcon from '@/material-icons/400-24px/check.svg?react';
import CloseIcon from '@/material-icons/400-24px/close.svg?react';
import GroupIcon from '@/material-icons/400-24px/group.svg?react';
import SearchIcon from '@/material-icons/400-24px/search.svg?react';
import LockIcon from '@/styles/bird-theme-svg/lock-fill.svg?react';
import { addDmRoomMembers, createDmRoom } from 'mastodon/actions/dm_rooms';
import { importFetchedAccounts } from 'mastodon/actions/importer';
import { apiRequest } from 'mastodon/api';
import type { ApiAccountJSON } from 'mastodon/api_types/accounts';
import type { ApiDmRoomJSON } from 'mastodon/api_types/dm_rooms';
import { Avatar } from 'mastodon/components/avatar';
import { Icon } from 'mastodon/components/icon';
import { IconButton } from 'mastodon/components/icon_button';
import { LoadingIndicator } from 'mastodon/components/loading_indicator';
import { me } from 'mastodon/initial_state';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

import { selectMessageAccount } from './selectors';

const messages = defineMessages({
  close: { id: 'lightbox.close', defaultMessage: 'Close' },
  search: {
    id: 'messages.new.search',
    defaultMessage: 'Search for someone',
  },
  remove: {
    id: 'messages.new.remove',
    defaultMessage: 'Remove {name}',
  },
  back: { id: 'column_back_button.label', defaultMessage: 'Back' },
  locked: {
    id: 'account.locked_info',
    defaultMessage:
      'This account privacy status is set to locked. The owner manually reviews who can follow them.',
  },
});

const SEARCH_LIMIT = 20;

const FOLLOWING_LIMIT = 80;

const RecipientRow: React.FC<{
  accountId: string;
  disabled: boolean;

  selectable: boolean;
  selected: boolean;
  onSelect: (accountId: string) => void;
}> = ({ accountId, disabled, selectable, selected, onSelect }) => {
  const intl = useIntl();
  const account = useAppSelector((state) =>
    selectMessageAccount(state, accountId),
  );

  const handleClick = useCallback(() => {
    onSelect(accountId);
  }, [accountId, onSelect]);

  if (!account) return null;

  return (
    <button
      type='button'
      className={classNames('dm-recipient__row', {
        'dm-recipient__row--selected': selectable && selected,
      })}
      aria-pressed={selectable ? selected : undefined}
      disabled={disabled}
      onClick={handleClick}
    >
      <Avatar account={account} size={44} />

      <span className='dm-recipient__row__text'>
        <span className='dm-recipient__row__name'>
          {account.display_name.length > 0
            ? account.display_name
            : account.username}

          {account.locked && (
            <Icon
              id='lock'
              icon={LockIcon}
              className='dm-recipient__row__lock'
              title={intl.formatMessage(messages.locked)}
            />
          )}
        </span>

        <span className='dm-recipient__row__handle'>@{account.acct}</span>
      </span>

      {selectable && (
        <span
          className={classNames('dm-recipient__row__check', {
            'dm-recipient__row__check--on': selected,
          })}
          aria-hidden='true'
        >
          {selected && <Icon id='check' icon={CheckIcon} />}
        </span>
      )}
    </button>
  );
};

const RecipientChip: React.FC<{
  accountId: string;
  disabled: boolean;
  onRemove: (accountId: string) => void;
}> = ({ accountId, disabled, onRemove }) => {
  const intl = useIntl();
  const account = useAppSelector((state) =>
    selectMessageAccount(state, accountId),
  );

  const handleClick = useCallback(() => {
    onRemove(accountId);
  }, [accountId, onRemove]);

  if (!account) return null;

  const name =
    account.display_name.length > 0 ? account.display_name : account.username;

  return (
    <button
      type='button'
      className='dm-recipient__chip'
      disabled={disabled}
      aria-label={intl.formatMessage(messages.remove, { name })}
      onClick={handleClick}
    >
      <Avatar account={account} size={20} />
      <span className='dm-recipient__chip__name'>{name}</span>
      <Icon id='times' icon={CloseIcon} />
    </button>
  );
};

const DmRecipientModal: React.FC<{
  onCreated?: (roomId: string) => void;

  inviteToRoomId?: string;

  excludeIds?: string[];
  onClose: () => void;
}> = ({ onCreated, inviteToRoomId, excludeIds, onClose }) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();

  const [query, setQuery] = useState('');
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [hasError, setHasError] = useState(false);

  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [isLoadingFollowing, setIsLoadingFollowing] = useState(true);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const [mode, setMode] = useState<'single' | 'group'>(
    inviteToRoomId ? 'group' : 'single',
  );

  const isInvite = Boolean(inviteToRoomId);
  const isGroup = mode === 'group' || isInvite;

  const requestRef = useRef<AbortController | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
      requestRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    searchInput.current?.focus();
  }, []);

  useEffect(() => {
    if (!me) {
      setIsLoadingFollowing(false);
      return;
    }

    void apiRequest<ApiAccountJSON[]>('GET', `v1/accounts/${me}/following`, {
      params: { limit: FOLLOWING_LIMIT },
    })
      .then((data) => {
        if (!mountedRef.current) return '';

        dispatch(importFetchedAccounts(data));
        setFollowingIds(data.map((account) => account.id));
        setIsLoadingFollowing(false);

        return '';
      })
      .catch(() => {
        if (mountedRef.current) setIsLoadingFollowing(false);
      });
  }, [dispatch]);

  const runSearch = useDebouncedCallback(
    (value: string) => {
      requestRef.current?.abort();

      if (value.trim().length === 0) {
        setAccountIds([]);
        setSearched(false);
        setHasError(false);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      setHasError(false);
      requestRef.current = new AbortController();

      void apiRequest<ApiAccountJSON[]>('GET', 'v1/accounts/search', {
        signal: requestRef.current.signal,
        params: {
          q: value,
          limit: SEARCH_LIMIT,

          resolve: false,
        },
      })
        .then((data) => {
          if (!mountedRef.current) return '';

          dispatch(importFetchedAccounts(data));
          setAccountIds(data.map((a) => a.id).filter((id) => id !== me));
          setSearched(true);
          setIsSearching(false);
          return '';
        })
        .catch((err: unknown) => {
          if (!mountedRef.current) return;

          if (isCancel(err)) return;

          setHasError(true);
          setSearched(true);
          setIsSearching(false);
        });
    },
    500,
    { leading: false, trailing: true },
  );

  const handleQueryChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(event.target.value);
      runSearch(event.target.value);
    },
    [runSearch],
  );

  const createRoom = useCallback(
    (ids: string[]) => {
      if (isCreating || ids.length === 0) return;

      setIsCreating(true);

      const pending = dispatch(
        inviteToRoomId
          ? addDmRoomMembers({ roomId: inviteToRoomId, accountIds: ids })
          : createDmRoom({ accountIds: ids }),
      ) as unknown as Promise<{
        meta: { requestStatus: string };
        payload?: ApiDmRoomJSON;
      }>;

      void pending.then((result) => {
        if (!mountedRef.current) return result;

        if (result.meta.requestStatus === 'fulfilled' && result.payload) {
          if (!inviteToRoomId) onCreated?.(result.payload.id);
          onClose();
        } else {
          setIsCreating(false);
        }

        return result;
      });
    },
    [dispatch, inviteToRoomId, isCreating, onClose, onCreated],
  );

  const handleSelect = useCallback(
    (accountId: string) => {
      if (isCreating) return;

      if (!isGroup) {
        createRoom([accountId]);
        return;
      }

      setSelectedIds((current) =>
        current.includes(accountId)
          ? current.filter((id) => id !== accountId)
          : [...current, accountId],
      );
    },
    [createRoom, isCreating, isGroup],
  );

  const handleOpenGroup = useCallback(() => {
    setMode('group');
    setQuery('');
    setAccountIds([]);
    setSearched(false);
    setHasError(false);
    searchInput.current?.focus();
  }, []);

  const handleBack = useCallback(() => {
    setMode('single');
    setSelectedIds([]);
    setQuery('');
    setAccountIds([]);
    setSearched(false);
    setHasError(false);
  }, []);

  const handleDeselect = useCallback((accountId: string) => {
    setSelectedIds((current) => current.filter((id) => id !== accountId));
  }, []);

  const handleStart = useCallback(() => {
    createRoom(selectedIds);
  }, [createRoom, selectedIds]);

  const hasQuery = query.trim() !== '';

  const visibleIds = useMemo(() => {
    const source = hasQuery ? accountIds : followingIds;

    if (!excludeIds?.length) return source;

    return source.filter((id) => !excludeIds.includes(id));
  }, [accountIds, excludeIds, followingIds, hasQuery]);

  const isEmpty = hasQuery
    ? searched && !isSearching && !hasError && visibleIds.length === 0
    : !isLoadingFollowing && visibleIds.length === 0;

  const isLoadingList = hasQuery
    ? isSearching && visibleIds.length === 0
    : isLoadingFollowing;

  const handleSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      if (event.which === 229 || event.nativeEvent.isComposing) return;

      if (event.key !== 'Enter') return;

      event.preventDefault();

      if (isGroup && selectedIds.length > 0) {
        handleStart();
        return;
      }

      const first = visibleIds[0];

      if (!first) return;

      handleSelect(first);
    },
    [handleSelect, handleStart, isGroup, selectedIds.length, visibleIds],
  );


  return (
    <div
      className={classNames('modal-root__modal dialog-modal dm-recipient', {
        'dm-recipient--group': isGroup,
      })}
    >
      <div className='dialog-modal__header dm-recipient__header'>
        {isGroup && !isInvite && (
          <IconButton
            className='dm-recipient__header__back'
            title={intl.formatMessage(messages.back)}
            icon='chevron-left'
            iconComponent={ArrowBackIcon}
            disabled={isCreating}
            onClick={handleBack}
          />
        )}

        <span className='dialog-modal__header__title'>
          {isInvite ? (
            <FormattedMessage
              id='messages.members.add'
              defaultMessage='Add people'
            />
          ) : isGroup ? (
            <FormattedMessage
              id='messages.new.group_title'
              defaultMessage='Create a group'
            />
          ) : (
            <FormattedMessage
              id='messages.new.title'
              defaultMessage='New message'
            />
          )}
        </span>

        <IconButton
          className='dialog-modal__header__close'
          title={intl.formatMessage(messages.close)}
          icon='times'
          iconComponent={CloseIcon}
          onClick={onClose}
        />
      </div>

      <div className='dialog-modal__content dm-recipient__content'>
        {isGroup && (
          <div className='dm-recipient__picked'>
            <button
              type='button'
              className='button dm-recipient__next'
              disabled={isCreating || selectedIds.length === 0}
              onClick={handleStart}
            >
              {selectedIds.length > 0 && isInvite ? (
                <FormattedMessage
                  id='messages.members.invite_count'
                  defaultMessage='Add ({count})'
                  values={{ count: selectedIds.length }}
                />
              ) : selectedIds.length > 0 ? (
                <FormattedMessage
                  id='messages.new.start'
                  defaultMessage='Start conversation ({count})'
                  values={{ count: selectedIds.length }}
                />
              ) : (
                <FormattedMessage
                  id='messages.new.next'
                  defaultMessage='Next'
                />
              )}
            </button>
          </div>
        )}

        <div className='dm-recipient__search'>
          <Icon
            id='search'
            icon={SearchIcon}
            className='dm-recipient__search__icon'
          />

          <input
            ref={searchInput}
            type='text'
            value={query}
            placeholder={intl.formatMessage(messages.search)}
            aria-label={intl.formatMessage(messages.search)}
            onChange={handleQueryChange}
            onKeyDown={handleSearchKeyDown}
          />
        </div>

        {isGroup && selectedIds.length > 0 && (
          <div className='dm-recipient__chips'>
            {selectedIds.map((accountId) => (
              <RecipientChip
                key={accountId}
                accountId={accountId}
                disabled={isCreating}
                onRemove={handleDeselect}
              />
            ))}
          </div>
        )}

        {!isGroup && (
          <button
            type='button'
            className='dm-recipient__group-entry'
            disabled={isCreating}
            onClick={handleOpenGroup}
          >
            <span className='dm-recipient__group-entry__icon'>
              <Icon id='group' icon={GroupIcon} />
            </span>

            <FormattedMessage
              id='messages.new.create_group'
              defaultMessage='Create a group'
            />
          </button>
        )}

        <div className='dm-recipient__results' role='status'>
          {(isLoadingList || (isCreating && visibleIds.length === 0)) && (
            <LoadingIndicator />
          )}

          {hasQuery && hasError && (
            <p className='dm-recipient__empty'>
              <FormattedMessage
                id='messages.new.search_failed'
                defaultMessage='Search failed. Try again.'
              />
            </p>
          )}

          {isEmpty && (
            <p className='dm-recipient__empty'>
              {hasQuery ? (
                <FormattedMessage
                  id='messages.new.no_results'
                  defaultMessage='No one found.'
                />
              ) : (
                <FormattedMessage
                  id='messages.new.no_following'
                  defaultMessage='Search for someone by name or handle.'
                />
              )}
            </p>
          )}

          {visibleIds.length > 0 && (
            <div className='dm-recipient__list'>
              {visibleIds.map((accountId) => (
                <RecipientRow
                  key={accountId}
                  accountId={accountId}
                  disabled={isCreating}
                  selectable={isGroup}
                  selected={selectedIds.includes(accountId)}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export
export default DmRecipientModal;
