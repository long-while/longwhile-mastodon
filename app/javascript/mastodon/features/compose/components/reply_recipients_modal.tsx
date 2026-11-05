// @_longwhile custom feature / 한참(longwhile) 제작 기능 — 답글 수신자 고르기
//
//   "@A @B 에게 보내는 답글" 을 누르면 열린다. 대화에 얽힌 사람들을 늘어놓고,
//   체크를 꺼서 **이번 답글에서 뺀다.**
//
//   왜 필요한가. 봇을 부르면 그 답이 참여자 전원을 멘션한 채로 돌아온다. 거기에
//   답글을 달면 봇까지 다시 부르게 되어, 사람끼리 이어가려던 대화가 명령 호출로
//   읽힌다. 지금은 작성창에 붙은 핸들을 지울 방법이 아예 없다.
//
//   **답글 대상(직멘 대상)도 뺄 수 있다.** 참조한 트위터 구현은 그 한 명을 고정해
//   두는데, 여기서는 그 사람이 바로 봇인 경우가 흔하다. 고정하면 이 기능이 정작
//   필요한 자리에서만 안 듣는다. 뺀다고 답글 관계가 끊기지는 않는다 —
//   `in_reply_to_id` 는 그대로라 글타래에는 그대로 붙고, 알림만 가지 않는다.
//
//   **모양은 새 쪽지 모달(messages/recipient_modal)에서 그대로 가져온다.**
//   `dm-recipient` 클래스를 같이 쓰므로 색·간격·호버가 저절로 따라온다. 다른
//   점은 셋뿐이다.
//
//     헤더    X · 제목 · 완료   (새 쪽지는 제목 · X)
//     검색    없다             (후보가 정해져 있어 찾을 것이 없다)
//     체크    네모난 체크박스   (새 쪽지는 동그라미 — 그쪽은 "고르기", 여기는 "포함")
//
//   **고른 것은 "완료" 를 눌러야 반영된다.** X 는 되돌린다. 헤더에 둘이 나란히
//   있는데 X 가 저장하고 닫으면 취소할 방법이 없어 보인다.
//
//   `selectMessageAccount` 를 DM 쪽에서 가져다 쓴다. 그 파일이 있는 이유는 DM 이
//   아니라 **이 저장소의 rootReducer 가 any 로 선언되어 있다**는 것이라, 계정을
//   타입 있게 읽는 유일한 통로다. DM 기능을 걷어낼 일이 생기면 그 셀렉터는
//   남기거나 여기로 옮겨야 한다.

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

// 이 저장소의 rootReducer 는 다중 계정 전환(RESET_ALL) 처리를 위해 any 로 선언되어
// 있어 RootState 가 해석되지 않는다. 우리가 읽는 조각만 여기서 형태를 밝힌다 —
// features/messages/selectors.ts 가 같은 이유로 같은 일을 한다.
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

// 사람 한 줄. 아바타 · (이름 / 핸들) · 체크박스.
//
// 계정을 스토어에서 못 찾아도 **줄을 지우지 않는다.** 새 쪽지 모달은 그럴 때
// null 을 돌려주는데, 그쪽 목록은 방금 받아온 계정들이라 그런 일이 없다. 여기
// 후보는 글에 딸려온 멘션이라 계정 본체가 스토어에 없을 수 있고, 줄이 사라지면
// **체크는 켜져 있는데 목록에는 안 보이는 사람**이 생긴다. 그때는 핸들만 그린다.
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

      {/* 진짜 체크박스를 쓴다. 보이지 않게 두고 그림만 우리가 그린다 — 키보드
          이동과 스크린 리더의 "선택됨" 낭독을 직접 흉내 내지 않기 위해서다.
          바깥이 <label> 이라 줄 어디를 눌러도 토글된다. */}
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

  // **Immutable 컬렉션 자체를 받아 useMemo 로 편다.** `useAppSelector` 는 참조
  // 비교라, 셀렉터 안에서 `toJS()` 를 부르면 매번 새 배열이 나와 **디스패치마다
  // 리렌더된다.** (features/messages/selectors.ts 의 같은 주석)
  const candidates = useAppSelector(selectReplyCandidates);
  const mentions = useAppSelector(selectReplyMentions);

  const candidateList = useMemo(
    () => candidates.toJS() as unknown as Candidate[],
    [candidates],
  );

  // 초안. "완료" 를 누를 때까지 작성창은 그대로다.
  const [selected, setSelected] = useState<string[]>(() => mentions.toJS());

  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  // 멘션은 글에 딸려온 것이라 **계정 본체가 스토어에 없을 수 있다.** 글쓴이는
  // 대개 들어와 있지만 함께 멘션된 사람들은 아니다. 아바타와 표시 이름을 그리려면
  // 없는 것만 한 번 받아와야 한다.
  //
  // **배열이 아니라 문자열로 뽑는다.** `useAppSelector` 는 참조 비교라, 배열을
  // 돌려주면 디스패치마다 새 값이 되어 아래 useEffect 가 계속 다시 돈다.
  const missingKey = useAppSelector((state) =>
    candidateList
      .filter((candidate) => !selectMessageAccount(state, candidate.id))
      .map((candidate) => candidate.id)
      .join(','),
  );

  // 실패해도 알리지 않는다 — 핸들만으로도 고를 수 있어 화면이 못 쓰게 되지 않고,
  // 여기서 알려봐야 사용자가 할 수 있는 일이 없다.
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
        {/* X 가 **왼쪽**, "완료" 가 오른쪽이다. 새 쪽지 모달은 닫기가 오른쪽인데,
            거기는 그 자리를 다투는 것이 없다. 여기서 둘을 같은 쪽에 두면 닫으려다
            저장한다. 배치는 SCSS 가 `flex-direction` 을 되돌려서 만든다 —
            상류 헤더가 `row-reverse` 라 DOM 순서만으로는 뒤집힌다. */}
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

        {/* 하나도 안 고른 상태로도 완료할 수 있다. 아무도 부르지 않는 답글은
            정상이다 — 글타래에는 그대로 붙고 알림만 가지 않는다. */}
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
