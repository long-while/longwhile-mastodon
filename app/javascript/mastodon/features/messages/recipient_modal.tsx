// @_longwhile custom feature

import { useCallback, useEffect, useRef, useState } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import classNames from 'classnames';

import { isCancel } from 'axios';
import { useDebouncedCallback } from 'use-debounce';

import CheckIcon from '@/material-icons/400-24px/check.svg?react';
import CloseIcon from '@/material-icons/400-24px/close.svg?react';
import { createDmRoom } from 'mastodon/actions/dm_rooms';
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
});

const SEARCH_LIMIT = 12;

const RecipientRow: React.FC<{
  accountId: string;
  disabled: boolean;
  selected: boolean;
  onSelect: (accountId: string) => void;
}> = ({ accountId, disabled, selected, onSelect }) => {
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
      className={classNames('dm-recipient__cell', {
        'dm-recipient__cell--selected': selected,
      })}
      aria-pressed={selected}
      disabled={disabled}
      onClick={handleClick}
    >
      <span className='dm-recipient__cell__figure'>
        <Avatar account={account} size={56} />

        {selected && (
          <span className='dm-recipient__cell__check' aria-hidden='true'>
            <Icon id='check' icon={CheckIcon} />
          </span>
        )}
      </span>

      <span className='dm-recipient__cell__name'>
        {account.display_name.length > 0
          ? account.display_name
          : account.username}
      </span>

      <span className='dm-recipient__cell__handle'>@{account.acct}</span>
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
  onCreated: (roomId: string) => void;
  onClose: () => void;
}> = ({ onCreated, onClose }) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();

  const [query, setQuery] = useState('');
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [hasError, setHasError] = useState(false);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const [multiSelect, setMultiSelect] = useState(false);

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
        createDmRoom({ accountIds: ids }),
      ) as unknown as Promise<{
        meta: { requestStatus: string };
        payload?: ApiDmRoomJSON;
      }>;

      void pending.then((result) => {
        if (!mountedRef.current) return result;

        if (result.meta.requestStatus === 'fulfilled' && result.payload) {
          onCreated(result.payload.id);
          onClose();
        } else {
          setIsCreating(false);
        }

        return result;
      });
    },
    [dispatch, isCreating, onClose, onCreated],
  );

  const handleSelect = useCallback(
    (accountId: string) => {
      if (isCreating) return;

      if (!multiSelect) {
        createRoom([accountId]);
        return;
      }

      setSelectedIds((current) =>
        current.includes(accountId)
          ? current.filter((id) => id !== accountId)
          : [...current, accountId],
      );
    },
    [createRoom, isCreating, multiSelect],
  );

  const handleToggleMulti = useCallback(() => {
    setMultiSelect((current) => {
      if (current) setSelectedIds([]);
      return !current;
    });
  }, []);

  const handleDeselect = useCallback((accountId: string) => {
    setSelectedIds((current) => current.filter((id) => id !== accountId));
  }, []);

  const handleStart = useCallback(() => {
    createRoom(selectedIds);
  }, [createRoom, selectedIds]);

  const handleSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      if (event.which === 229 || event.nativeEvent.isComposing) return;

      if (event.key !== 'Enter') return;

      event.preventDefault();

      if (multiSelect && selectedIds.length > 0) {
        handleStart();
        return;
      }

      const first = accountIds[0];

      if (!first) return;

      handleSelect(first);
    },
    [accountIds, handleSelect, handleStart, multiSelect, selectedIds.length],
  );

  const isEmpty =
    searched && !isSearching && !hasError && accountIds.length === 0;

  return (
    <div className='modal-root__modal dialog-modal dm-recipient'>
      <div className='dialog-modal__header'>
        <IconButton
          className='dialog-modal__header__close'
          title={intl.formatMessage(messages.close)}
          icon='times'
          iconComponent={CloseIcon}
          onClick={onClose}
        />

        <span className='dialog-modal__header__title'>
          <FormattedMessage id='messages.new.title' defaultMessage='New message' />
        </span>
      </div>

      <div className='dialog-modal__content'>
        <div className='dm-recipient__search'>
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

        <div className='dm-recipient__mode'>
          <button
            type='button'
            className={classNames('dm-recipient__mode__toggle', {
              'dm-recipient__mode__toggle--on': multiSelect,
            })}
            aria-pressed={multiSelect}
            disabled={isCreating}
            onClick={handleToggleMulti}
          >
            <FormattedMessage
              id='messages.new.multi_select'
              defaultMessage='Message several people'
            />
          </button>
        </div>

        {selectedIds.length > 0 && (
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

        <div className='dm-recipient__results' role='status'>
          {(isSearching || isCreating) && accountIds.length === 0 && (
            <LoadingIndicator />
          )}

          {hasError && (
            <p className='dm-recipient__empty'>
              <FormattedMessage
                id='messages.new.search_failed'
                defaultMessage='Search failed. Try again.'
              />
            </p>
          )}

          {isEmpty && (
            <p className='dm-recipient__empty'>
              <FormattedMessage
                id='messages.new.no_results'
                defaultMessage='No one found.'
              />
            </p>
          )}

          {accountIds.length > 0 && (
            <div className='dm-recipient__grid'>
              {accountIds.map((accountId) => (
                <RecipientRow
                  key={accountId}
                  accountId={accountId}
                  disabled={isCreating}
                  selected={selectedIds.includes(accountId)}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          )}
        </div>

        {selectedIds.length > 0 && (
          <div className='dm-recipient__actions'>
            <button
              type='button'
              className='button dm-recipient__start'
              disabled={isCreating}
              onClick={handleStart}
            >
              <FormattedMessage
                id='messages.new.start'
                defaultMessage='Start conversation ({count})'
                values={{ count: selectedIds.length }}
              />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export
export default DmRecipientModal;
