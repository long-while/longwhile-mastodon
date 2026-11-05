// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅

import { useCallback, useMemo, useState } from 'react';

import { defineMessages, FormattedMessage, FormattedTime, useIntl } from 'react-intl';

import classNames from 'classnames';

import type { List as ImmutableList, Map as ImmutableMap } from 'immutable';

import { openModal } from 'mastodon/actions/modal';
import { Avatar } from 'mastodon/components/avatar';
import { ContentWarning } from 'mastodon/components/content_warning';
import MediaGalleryRaw from 'mastodon/components/media_gallery';
import StatusContentRaw from 'mastodon/components/status_content';
import CardRaw from 'mastodon/features/status/components/card';
import { displayMedia } from 'mastodon/initial_state';
import type { Status } from 'mastodon/models/status';
import { useAppDispatch, useAppSelector } from 'mastodon/store';
import { stripLeadingMentions } from 'mastodon/utils/strip_leading_mentions';

import { selectMessageAccount } from '../selectors';
import { isOnlyMemberMentions } from '../util/only_mentions';

import { MessageMenu } from './message_menu';

// 두 컴포넌트 모두 connect()/withRouter 를 거치며 prop 타입이 지워진다. 우리가
// 넘기는 형태만 다시 붙인다.
const StatusContent = StatusContentRaw as unknown as React.ComponentType<{
  status: Status;
  statusContent?: string;
}>;

const MediaGallery = MediaGalleryRaw as unknown as React.ComponentType<{
  media: unknown;
  sensitive?: boolean;
  lang?: string;
  onOpenMedia: (media: unknown, index: number, lang?: string) => void;
}>;

// 타임라인이 쓰는 링크 미리보기 카드 그대로다(components/status.jsx).
const Card = CardRaw as unknown as React.ComponentType<{
  card: ImmutableMap<string, unknown>;
  sensitive?: boolean;
  onOpenMedia: (media: unknown, index: number, lang?: string) => void;
}>;

// 사진 한 장의 비율을 이 범위로 묶는다. 세로로 긴 사진이 화면을 통째로 차지하거나
// 아주 넓은 파노라마가 실처럼 납작해지지 않게 한다. 넘치는 부분은 초점(focus)을
// 기준으로 잘린다 — 전체는 눌러서 여는 미디어 창에서 본다. (X 의 DM 과 같다)
const MIN_SINGLE_ASPECT = 3 / 4;
const MAX_SINGLE_ASPECT = 2;

const messages = defineMessages({
  audioAttachment: {
    id: 'messages.audio_attachment',
    defaultMessage: 'Audio attachment',
  },
  // 숫자만 그리므로 스크린 리더에는 뜻이 없다. 읽어 줄 문장을 따로 둔다.
  unreadBy: {
    id: 'messages.unread_by',
    defaultMessage: '{count} have not read this',
  },
});

interface Props {
  status: Status;

  // 이 방 참여자의 프로필 URL. 본문 앞에 붙은 수신자 핸들을 지우는 기준이다.
  memberUrls: Set<string>;

  isMine: boolean;

  // 이 메시지를 **아직 안 읽은 사람 수**. 0 이면 아무것도 그리지 않는다. (FR-16)
  //
  // 카카오톡과 같은 방식이다. 1대1 이면 상대가 읽기 전까지 1 이 떠 있다가 읽으면
  // 사라지고, 3인 방이면 2 → 1 → 없음으로 줄어든다.
  //
  // **방 쪽에서 계산해 넘긴다.** 이 컴포넌트는 판정하지 않는다 — 누가 어디까지
  // 읽었는지는 방 단위 정보다. 근거: docs/dm-chat/phases/dm-chat-phase-4.md §3.3
  unreadBy?: number;

  isFirstInGroup: boolean;

  // 지금은 CSS 규칙이 걸려 있지 않다. 꼬리(한쪽 아래 모서리만 0)를 없애면서
  // 모서리를 묶음 위치에 따라 바꿀 일이 사라졌기 때문이다. 클래스는 남겨 둔다 —
  // 묶음의 끝에만 무언가(읽음 표시, 구분선)를 붙일 여지가 있다.
  isLastInGroup: boolean;

  // 덩어리가 **발신자 전환**으로 시작했는지. 여백만 가른다(§group_messages.ts).
  isSenderChanged: boolean;

  showTimestamp: boolean;

  // 그룹 방에서만 상대 이름을 붙인다. 1대1 에서는 자명하다.
  showSenderName: boolean;

  // 방 id. 메뉴의 "나에게서만 삭제" 가 방 안의 경로를 쓴다. 운영진 열람 화면은
  // 넘기지 않는다 — 그쪽은 readOnly 라 메뉴 자체가 안 뜬다.
  roomId?: string;

  // 편집·다시 쓰기. 둘 다 DM 입력창의 상태를 바꾸므로 방이 처리한다.
  onEdit?: (statusId: string) => void;
  onRedraft?: (statusId: string) => void;

  // 읽기 전용. 운영진이 남의 대화를 열람하는 화면(/messages/all)에서 켠다.
  // 컨텍스트 메뉴를 통째로 감춘다 — 삭제는 참여자의 동작이다.
  // 이름표도 양쪽 다 붙는다. 운영진에게는 "내 메시지" 라는 것이 없다.
  readOnly?: boolean;
}

export const MessageBubble: React.FC<Props> = ({
  status,
  memberUrls,
  isMine,
  unreadBy = 0,
  isFirstInGroup,
  isLastInGroup,
  isSenderChanged,
  showTimestamp,
  showSenderName,
  roomId,
  onEdit,
  onRedraft,
  readOnly = false,
}) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();

  const accountId = status.get('account') as string | undefined;
  const account = useAppSelector((state) =>
    selectMessageAccount(state, accountId),
  );

  // 콘텐츠 워닝은 접힌 채로 시작한다. 한 번 펼치면 방에 머무는 동안 유지되고,
  // 나가면 초기화된다. (기획서 §4.3.9)
  const [expanded, setExpanded] = useState(false);
  const handleToggle = useCallback(() => {
    setExpanded((value) => !value);
  }, []);

  const spoilerHtml = status.get('spoilerHtml') as string | undefined;
  const hasWarning = Boolean((status.get('spoiler_text') as string | undefined)?.length);

  const language = status.get('language') as string | undefined;
  const statusId = status.get('id') as string;
  const isSensitive = Boolean(status.get('sensitive'));

  // 소리 첨부는 MediaGallery 가 그리지 못한다. Item.render 의 분기가 unknown /
  // image / gifv·video 뿐이라 audio 는 어디에도 안 걸려 빈 상자만 남는다.
  // 공식 앱에서 보낸 음성 메시지가 여기서 통째로 안 보이면 안 되므로 따로 그린다.
  const allMedia = status.get('media_attachments') as
    | ImmutableList<ImmutableMap<string, unknown>>
    | undefined;

  const audioMedia = useMemo(
    () => allMedia?.filter((item) => item.get('type') === 'audio'),
    [allMedia],
  );

  const galleryMediaList = useMemo(
    () => allMedia?.filter((item) => item.get('type') !== 'audio'),
    [allMedia],
  );

  const hasGalleryMedia = Boolean(galleryMediaList && !galleryMediaList.isEmpty());
  const hasAudio = Boolean(audioMedia && !audioMedia.isEmpty());

  // 한 장일 때만 사진의 원래 비율을 쓴다(범위 안으로 묶어서). 여러 장은
  // MediaGallery 의 격자 비율(3:2)을 그대로 둔다.
  const singleAspect = useMemo(() => {
    if (galleryMediaList?.size !== 1) return undefined;

    const aspect = galleryMediaList.getIn([0, 'meta', 'small', 'aspect']);

    if (typeof aspect !== 'number' || !Number.isFinite(aspect) || aspect <= 0) {
      return undefined;
    }

    return Math.min(MAX_SINGLE_ASPECT, Math.max(MIN_SINGLE_ASPECT, aspect));
  }, [galleryMediaList]);

  // 첨부가 있으면 링크 카드는 그리지 않는다. 타임라인과 같은 규칙이고, 서버도
  // 첨부가 있는 글에는 카드를 만들지 않는다(FetchLinkCardService).
  const card = status.get('card') as ImmutableMap<string, unknown> | null | undefined;
  const showCard = Boolean(card) && !hasGalleryMedia && !hasAudio;

  // MediaGallery 는 onOpenMedia 를 필수로 받는다. 넘기지 않으면 첨부를 누르는
  // 순간 undefined 를 호출해 터진다 — 라이트박스가 안 열리는 정도가 아니다.
  //
  // statusId 는 일부러 넘기지 않는다. 넘기면 라이트박스 아래에 상류의 Footer 가
  // 붙고, 그 답장 버튼이 **공개 범위 선택기가 달린 전역 툿 작성창**을 연다.
  // 채팅에서 공개 범위를 노출하지 않기로 한 것(FR-12)이 거기서 뚫린다.
  const handleOpenMedia = useCallback(
    (galleryMedia: unknown, index: number, lang?: string) => {
      dispatch(
        openModal({
          modalType: 'MEDIA',
          modalProps: { media: galleryMedia, index, lang },
        }),
      );
    },
    [dispatch],
  );

  // 수신자 핸들은 배달을 위해 본문에 실제로 들어간다. 화면에서는 지운다. CSS 로
  // 감추지 않는 이유는 복사하면 딸려오고 스크린 리더가 읽기 때문이다.
  // (FR-13, 기획서 §11.5)
  //
  // 기존 utils/strip_leading_mentions 를 그대로 쓴다. 방의 첫 메시지는 답장이
  // 아니라서 StatusContent 안의 자동 처리가 걸리지 않으므로, 방 멤버 URL 을 직접
  // 넘겨 여기서 지운다.
  const contentHtml = useMemo(() => {
    const html = status.get('contentHtml') as string | undefined;

    return html ? stripLeadingMentions(html, memberUrls) : html;
  }, [status, memberUrls]);

  // 사진만 보낸 메시지는 본문이 수신자 핸들뿐이다. 그 핸들로 말풍선을 따로
  // 그리지 않는다(util/only_mentions.ts). 첨부가 없을 때는 따지지 않는다 —
  // 그때 지우면 아무것도 남지 않는다.
  const addresseesOnly = useMemo(
    () =>
      (hasGalleryMedia || hasAudio) &&
      Boolean(contentHtml) &&
      isOnlyMemberMentions(contentHtml ?? '', memberUrls),
    [hasGalleryMedia, hasAudio, contentHtml, memberUrls],
  );

  const hasText =
    Boolean(contentHtml && contentHtml.trim() !== '') && !addresseesOnly;
  const showBody = !hasWarning || expanded;

  // 덩어리 **중간** 메시지에는 시각이 그려지지 않는다(`showTimestamp`). 그러면
  // 그 메시지가 몇 시 것인지 확인할 방법이 아예 없어지므로, 늘 그려지는 본문
  // 블록에 전체 시각을 달아 둔다. `<time>` 에 달면 시각이 이미 보이는 메시지에만
  // 걸려 정작 필요한 곳에서 빠진다.
  const createdAt = status.get('created_at') as string;
  const fullTime = intl.formatDate(createdAt, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  // 안 읽은 사람 수를 그릴지. 운영진 열람 화면에서는 참여자의 상태를 보여주지
  // 않는다. 0 이면 다 읽은 것이므로 그리지 않는다.
  //
  // **`isMine` 을 보지 않는다.** 그룹에서는 남의 메시지에도 붙어야 "누가 어디까지
  // 읽었는지" 를 알 수 있다. 1대1 에서 남의 메시지가 비는 것은 방 쪽 계산이
  // 글쓴이를 빼기 때문이지 여기서 막아서가 아니다(room.tsx 의 unreadCountFor).
  const showUnread = !readOnly && unreadBy > 0;

  return (
    <div
      // 인용을 눌렀을 때 원본으로 이동하는 기준점. 스크롤은 방 쪽에서 한다.
      id={`dm-message-${status.get('id') as string}`}
      className={classNames('dm-message', {
        'dm-message--mine': isMine,
        // `--theirs` 도 지금은 CSS 규칙이 없다. 방향은 `--mine` 하나로 갈리지만,
        // 받은 쪽에만 무언가를 붙일 때를 위해 대칭으로 남겨 둔다.
        'dm-message--theirs': !isMine,
        'dm-message--first': isFirstInGroup,
        'dm-message--last': isLastInGroup,
        'dm-message--sender-changed': isSenderChanged,
      })}
    >
      {/* 본문보다 먼저 읽혀야 누가 한 말인지 알고 듣는다. 발신자를 색상과 정렬로만
          구분하지 않는다. (기획서 §4.7) */}
      <span className='dm-message__sr-label'>
        {isMine ? (
          <FormattedMessage
            id='messages.sent_by_me'
            defaultMessage='Sent by you'
          />
        ) : (
          <FormattedMessage
            id='messages.sent_by_them'
            defaultMessage='Sent by {name}'
            values={{ name: account?.display_name ?? account?.username ?? '' }}
          />
        )}
      </span>

      {/* **그룹에서만** 아바타를 붙인다 (2026-08-12).

          1대1 에서는 상대가 헤더와 대화 시작 지점의 프로필 블록에 이미 있어,
          메시지마다 반복하면 좌측만 좁아진다. 그룹은 다르다 — 이름표만으로는
          긴 대화에서 누가 말하는지 눈이 계속 글자를 읽어야 한다.

          **덩어리의 첫 줄에만 그리고, 나머지 줄에는 빈 자리를 남긴다.** 자리를
          안 남기면 같은 사람의 두 번째 줄부터 말풍선이 왼쪽으로 튀어나가
          들쭉날쭉해진다.

          조건은 이름표와 같다. 운영진 열람 화면에는 "내 메시지" 라는 것이
          없으므로 양쪽 다 붙는다 — 오른쪽 줄에서는 `row-reverse` 때문에
          아바타도 함께 오른쪽으로 간다. */}
      {showSenderName && (readOnly || !isMine) && (
        <div className='dm-message__avatar' aria-hidden='true'>
          {isFirstInGroup && account && <Avatar account={account} size={28} />}
        </div>
      )}

      <div className='dm-message__body' title={fullTime}>
        {showSenderName && isFirstInGroup && (readOnly || !isMine) && account && (
          <span className='dm-message__sender'>
            {account.display_name || account.username}
          </span>
        )}

        {hasWarning && (
          <ContentWarning
            text={spoilerHtml ?? ''}
            expanded={expanded}
            onClick={handleToggle}
          />
        )}

        {/* 첨부가 글보다 **위**다. 사진을 먼저 보고 아래에 붙은 말을 읽는다(X·카카오톡의
            DM 과 같다). */}
        {/* 본문이 없으면 말풍선 배경 없이 미디어만 둔다. (기획서 §4.3.10)
            visible 을 넘기지 않는다. 넘기면 그것이 sensitive 와 사용자의
            "미디어 항상 가리기" 설정을 **둘 다** 덮어써서, 가려달라고 해둔
            사람에게도 민감함 이미지가 그대로 펼쳐진다. */}
        {showBody && hasGalleryMedia && (
          <div
            className={classNames('dm-message__media', {
              'dm-message__media--single': singleAspect !== undefined,
              // "숨기기" 단추를 남길지. 가릴 이유가 있는 사진에만 둔다 — 민감 표시가
              // 붙었거나, 사용자가 "미디어 항상 가리기" 를 켜 둔 경우(펼친 뒤 다시
              // 가릴 길이 그 단추뿐이다). 나머지 사진마다 단추가 떠 있으면 X 와
              // 달리 지저분하다. CSS 로만 감추므로 타임라인의 MediaGallery 는 그대로다.
              'dm-message__media--hideable':
                isSensitive || displayMedia === 'hide_all',
            })}
            style={
              singleAspect === undefined
                ? undefined
                : ({ '--dm-media-aspect': singleAspect } as React.CSSProperties)
            }
          >
            <MediaGallery
              media={galleryMediaList}
              sensitive={isSensitive}
              lang={language}
              onOpenMedia={handleOpenMedia}
            />
          </div>
        )}

        {showBody && hasAudio && (
          <div className='dm-message__audio'>
            {audioMedia?.map((item) => (
              // 사용자가 올린 음성에는 자막 트랙이 없다. 대체 텍스트가 있으면
              // aria-label 로 싣는다.
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <audio
                key={item.get('id') as string}
                controls
                preload='none'
                src={item.get('url') as string}
                aria-label={
                  (item.get('description') as string | null) ??
                  intl.formatMessage(messages.audioAttachment)
                }
              />
            ))}
          </div>
        )}

        {showBody && hasText && (
          <div className='dm-message__bubble'>
            <div className='dm-message__bubble__text'>
              <StatusContent status={status} statusContent={contentHtml} />
            </div>
          </div>
        )}

        {/* 링크 미리보기. 말풍선 **아래**에 따로 붙인다 — 말풍선 안에 넣으면
            말풍선 색(보낸 쪽은 브랜드 파랑) 위에 카드의 글자색이 얹혀 읽히지
            않고, 폭도 글자 길이에 끌려 다닌다. 폭은 사진과 같은 칸을 쓴다. */}
        {showBody && showCard && card && (
          <div className='dm-message__card'>
            <Card
              card={card}
              sensitive={isSensitive}
              onOpenMedia={handleOpenMedia}
            />
          </div>
        )}

      </div>

      {/* 시각과 읽음은 **말풍선 바깥**, 말풍선 옆 아래쪽에 둔다.
          `.dm-message` 가 flex 행이고 보낸 쪽은 `row-reverse` 라, 이 블록은
          가만히 둬도 늘 화면 안쪽(받은 쪽은 오른쪽, 보낸 쪽은 왼쪽)을 향한다.

          말풍선 **안**에 넣지 않는다. 안에 넣으면 본문 폭이 시각만큼 좁아져
          같은 길이의 글이 발신자에 따라 다르게 접히고, 첨부만 있어 말풍선이
          아예 없는 메시지에는 넣을 자리가 없어 분기가 하나 더 생긴다. */}
      {/* 시각과 ⋯ 를 **같은 상자에** 넣는다. 겹쳐 놓고 hover 로 갈아 끼우기
          위해서다(components.scss 의 `__aside`). 나란히 두면 ⋯ 가 나타날 때마다
          줄이 넓어져 말풍선이 밀린다. */}
      <div className='dm-message__aside'>
      {/* **시각이 붙는 메시지에만 숫자도 붙인다.**
          한때는 `showTimestamp || showUnread` 로 걸어, 시각이 없는 덩어리 중간
          메시지에도 숫자를 띄웠다. 연달아 보낸 다섯 줄에 1 이 다섯 번 뜨는데
          가리키는 것은 하나뿐이라, 읽은 사람이 는 것처럼 보였다.
          덩어리의 마지막 줄(시각이 붙는 줄) 하나만 세는 것으로 충분하다. */}
      {showTimestamp && (
        <div className='dm-message__meta'>
          {/* 아직 안 읽은 사람 수. (FR-16, Phase 4)
              카카오톡과 같은 방식이다 — 1대1 이면 상대가 읽기 전까지 1 이 떠
              있다가 읽으면 사라지고, 3인 방이면 2 → 1 → 없음으로 줄어든다.
              숫자만 그리므로 스크린 리더에는 뜻이 없다. 읽어 줄 문장을
              `aria-label` 로 따로 준다. 마우스로도 확인할 수 있게 `title` 도
              같이 둔다. */}
          {showUnread && (
            <span
              className='dm-message__unread'
              title={intl.formatMessage(messages.unreadBy, { count: unreadBy })}
              aria-label={intl.formatMessage(messages.unreadBy, {
                count: unreadBy,
              })}
            >
              {unreadBy}
            </span>
          )}

          <time className='dm-message__time' dateTime={createdAt} title={fullTime}>
            {/* 24시간제로 못박는다. 로케일 기본값을 쓰면 한국어에서 "오전 12:45"
                가 되어, 옆으로 놓은 이 칸이 메시지마다 들쭉날쭉해진다. */}
            <FormattedTime
              value={createdAt}
              hour='2-digit'
              minute='2-digit'
              hour12={false}
            />
          </time>
        </div>
      )}

        {/* 운영진 열람 화면에서는 감춘다 — 참여자의 동작이다. 내 메시지가 아니면
            메뉴 자체가 그려지지 않는다(message_menu.tsx). */}
        {!readOnly && (
          <MessageMenu
            statusId={statusId}
            isMine={isMine}
            roomId={roomId}
            // 화면에 보이는 그대로를 복사한다 — 수신자 핸들을 지운 뒤의 본문이다.
            contentHtml={contentHtml}
            onEdit={onEdit}
            onRedraft={onRedraft}
          />
        )}
      </div>
    </div>
  );
};
