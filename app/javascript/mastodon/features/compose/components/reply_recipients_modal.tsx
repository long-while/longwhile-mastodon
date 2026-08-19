// @_longwhile custom feature

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import classNames from 'classnames';

import type { List as ImmutableList, Map as ImmutableMap } from 'immutable';

import CheckIcon from '@/material-icons/400-24px/check.svg?react';
import CloseIcon from '@/material-icons/400-24px/close.svg?react';
import LockIcon from '@/styles/bird-theme-svg/lock-fill.svg?react';
import { setComposeReplyMentions } from 'mastodon/actions/compose';
import { importFetchedAccounts } from 'mastodon/actions/importer';
import { apiRequest } from 'mastodon/api';
import type { ApiAccountJSON } from 'mastodon/api_types/accounts';
import { Avatar } from 'mastodon/components/avatar';
import { Icon } from 'mastodon/components/icon';
import { IconButton } from 'mastodon/components/icon_button';
import { selectMessageAccount } from 'mastodon/features/messages/selectors';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

const messages = defineMessages({
  close: { id: 'lightbox.close', defaultMessage: 'Close' },
  toggle: {
    id: 'compose_form.recipients.toggle',
    defaultMessage: 'Mention {name} in this reply',
  },
  locked: {
    id: 'account.locked_info',
    defaultMessage:
      'This account privacy status is set to locked. The owner manually reviews who can follow them.',
  },
});

interface Candidate {
  id: string;
  acct: string;
}

interface ImmutableCompose {
  getIn: (path: string[]) => unknown;
}

const selectReplyCandidates = (state: unknown) =>
  (state as ImmutableCompose).getIn([
    'compose',
    'reply_candidates',
  ]) as ImmutableList<ImmutableMap<string, string>>;

const selectReplyMentions = (state: unknown) =>
  (state as ImmutableCompose).getIn([
    'compose',
    'reply_mentions',
  ]) as ImmutableList<string>;

const RecipientRow: React.FC<{
  candidate: Candidate;
  checked: boolean;
  onToggle: (acct: string) => void;
}> = ({ candidate, checked, onToggle }) => {
  const intl = useIntl();
  const account = useAppSelector((state) =>
    selectMessageAccount(state, candidate.id),
  );

  const handleChange = useCallback(() => {
    onToggle(candidate.acct);
  }, [candidate.acct, onToggle]);

  const name = account
    ? account.display_name.length > 0
      ? account.display_name
      : account.username
    : candidate.acct;

  return (
    <label className='dm-recipient__row compose-recipients__row'>
      {account ? (
        <Avatar account={account} size={44} />
      ) : (
        <span className='compose-recipients__row__avatar-placeholder' />
      )}

      <span className='dm-recipient__row__text'>
        <span className='dm-recipient__row__name'>
          {name}

          {account?.locked && (
            <Icon
              id='lock'
              icon={LockIcon}
              className='dm-recipient__row__lock'
              title={intl.formatMessage(messages.locked)}
            />
          )}
        </span>

        <span className='dm-recipient__row__handle'>@{candidate.acct}</span>
      </span>

      <input
        type='checkbox'
        className='compose-recipients__row__input'
        checked={checked}
        aria-label={intl.formatMessage(messages.toggle, { name })}
        onChange={handleChange}
      />

      <span
        className={classNames('compose-recipients__check', {
          'compose-recipients__check--on': checked,
        })}
        aria-hidden='true'
      >
        {checked && <Icon id='check' icon={CheckIcon} />}
      </span>
    </label>
  );
};

const ReplyRecipientsModal: React.FC<{ onClose: () => void }> = ({
  onClose,
}) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();

  const candidates = useAppSelector(selectReplyCandidates);
  const mentions = useAppSelector(selectReplyMentions);

  const candidateList = useMemo(
    () => candidates.toJS() as unknown as Candidate[],
    [candidates],
  );

  const [selected, setSelected] = useState<string[]>(() => mentions.toJS());

  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const missingKey = useAppSelector((state) =>
    candidateList
      .filter((candidate) => !selectMessageAccount(state, candidate.id))
      .map((candidate) => candidate.id)
      .join(','),
  );

  useEffect(() => {
    if (missingKey === '') return;

    void apiRequest<ApiAccountJSON[]>('GET', 'v1/accounts', {
      params: { id: missingKey.split(',') },
    })
      .then((data) => {
        if (mountedRef.current) dispatch(importFetchedAccounts(data));
        return '';
      })
      .catch(() => '');
  }, [dispatch, missingKey]);

  const handleToggle = useCallback((acct: string) => {
    setSelected((current) =>
      current.includes(acct)
        ? current.filter((item) => item !== acct)
        : [...current, acct],
    );
  }, []);

  const handleDone = useCallback(() => {
    dispatch(setComposeReplyMentions(selected));
    onClose();
  }, [dispatch, onClose, selected]);

  return (
    <div className='modal-root__modal dialog-modal dm-recipient compose-recipients'>
      <div className='dialog-modal__header dm-recipient__header compose-recipients__header'>
        <IconButton
          className='dialog-modal__header__close'
          title={intl.formatMessage(messages.close)}
          icon='times'
          iconComponent={CloseIcon}
          onClick={onClose}
        />

        <span className='dialog-modal__header__title'>
          <FormattedMessage
            id='compose_form.recipients.title'
            defaultMessage='Replying to'
          />
        </span>

        <button
          type='button'
          className='button compose-recipients__done'
          onClick={handleDone}
        >
          <FormattedMessage
            id='compose_form.recipients.done'
            defaultMessage='Done'
          />
        </button>
      </div>

      <div className='dialog-modal__content dm-recipient__content'>
        <div className='dm-recipient__results'>
          <div className='dm-recipient__list'>
            {candidateList.map((candidate) => (
              <RecipientRow
                key={candidate.acct}
                candidate={candidate}
                checked={selected.includes(candidate.acct)}
                onToggle={handleToggle}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export
export default ReplyRecipientsModal;
