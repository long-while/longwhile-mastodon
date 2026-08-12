// @_longwhile custom feature

import { useCallback, useEffect, useRef, useState } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import { isCancel } from 'axios';
import { useDebouncedCallback } from 'use-debounce';

import CloseIcon from '@/material-icons/400-24px/close.svg?react';
import { createDmRoom } from 'mastodon/actions/dm_rooms';
import { importFetchedAccounts } from 'mastodon/actions/importer';
import { apiRequest } from 'mastodon/api';
import type { ApiAccountJSON } from 'mastodon/api_types/accounts';
import type { ApiDmRoomJSON } from 'mastodon/api_types/dm_rooms';
import { Avatar } from 'mastodon/components/avatar';
import { DisplayName } from 'mastodon/components/display_name';
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
});

const SEARCH_LIMIT = 10;

const RecipientRow: React.FC<{
  accountId: string;
  disabled: boolean;
  onSelect: (accountId: string) => void;
}> = ({ accountId, disabled, onSelect }) => {
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
      className='dm-recipient__row'
      disabled={disabled}
      onClick={handleClick}
    >
      <Avatar account={account} size={36} />

      <div className='dm-recipient__row__name'>
        <DisplayName account={account} />
      </div>
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
  const [pendingId, setPendingId] = useState<string | null>(null);

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

  const handleSelect = useCallback(
    (accountId: string) => {
      if (pendingId) return;

      setPendingId(accountId);

      const pending = dispatch(
        createDmRoom({ accountIds: [accountId] }),
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
          setPendingId(null);
        }

        return result;
      });
    },
    [dispatch, onClose, onCreated, pendingId],
  );

  const handleSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      if (event.which === 229 || event.nativeEvent.isComposing) return;

      if (event.key !== 'Enter') return;

      const first = accountIds[0];

      if (!first) return;

      event.preventDefault();
      handleSelect(first);
    },
    [accountIds, handleSelect],
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

        <div className='dm-recipient__results' role='status'>
          {(isSearching || pendingId !== null) && accountIds.length === 0 && (
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

          {accountIds.map((accountId) => (
            <RecipientRow
              key={accountId}
              accountId={accountId}
              disabled={pendingId !== null}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export
export default DmRecipientModal;
