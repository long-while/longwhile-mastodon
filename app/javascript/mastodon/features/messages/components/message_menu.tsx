// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   메시지 컨텍스트 메뉴.
//
//     남의 메시지   채팅 내용 복사하기
//                   나에게서만 삭제
//
//     내 메시지     수정
//                   나에게서만 삭제
//                   모두에게서 삭제
//                   지우고 다시 쓰기
//
//   **셋을 이 커밋에서 새로 열었다.** 예전 주석에 "서버에 그런 것이 없다" 고
//   적어 두었던 항목들이다.
//
//     나에게서만 삭제  `dm_hidden_statuses` 테이블을 만들었다. 방 단위가 아니라
//                      (계정, 글) 단위다 — `dm_room_members.hidden_at` 은 방
//                      전체를 감추는 것(대화 나가기)이라 쓸 수 없었다.
//                      (마이그레이션 20260812000000)
//     수정             전역 `editStatus` 는 **툿 작성창**에 글을 넣는데, 이 화면은
//     지우고 다시 쓰기  그 패널을 감춰 두므로 눌러도 보이지 않는 곳에 글이 들어갈
//                      뿐이었다. DM 입력창에 편집 모드를 따로 만들어 붙였다
//                      (room.tsx 의 `editing`).
//
//   되돌릴 수 없는 셋은 전부 확인 모달을 거친다. "나에게서만 삭제" 는 특히
//   그렇다 — 되살리는 화면이 없어서, 잘못 누르면 그 메시지를 다시 볼 방법이
//   없다.
//
//   기존 Dropdown 을 그대로 쓴다. 키보드 이동·바깥 클릭 닫기·모바일 액션 시트
//   전환이 전부 붙어 있고, 우리가 다시 만들면 그중 하나는 반드시 빠진다.

import { useCallback, useMemo } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import MoreHorizIcon from '@/material-icons/400-24px/more_horiz.svg?react';
import { hideDmMessage } from 'mastodon/actions/dm_rooms';
import { openModal } from 'mastodon/actions/modal';
import { Dropdown } from 'mastodon/components/dropdown_menu';
import type { MenuItem } from 'mastodon/models/dropdown_menu';
import { useAppDispatch } from 'mastodon/store';
import { unescapeHTML } from 'mastodon/utils/html';

const messages = defineMessages({
  more: { id: 'status.more', defaultMessage: 'More' },
  copy: { id: 'messages.menu.copy', defaultMessage: 'Copy text' },
  edit: { id: 'messages.menu.edit', defaultMessage: 'Edit' },
  deleteForMe: {
    id: 'messages.menu.delete_for_me',
    defaultMessage: 'Delete for me',
  },
  deleteForEveryone: {
    id: 'messages.menu.delete_for_everyone',
    defaultMessage: 'Delete for everyone',
  },
  redraft: {
    id: 'messages.menu.redraft',
    defaultMessage: 'Delete & re-draft',
  },

  confirmDeleteForMeTitle: {
    id: 'confirmations.messages.delete_for_me.title',
    defaultMessage: 'Delete this message for you?',
  },
  confirmDeleteForMeMessage: {
    id: 'confirmations.messages.delete_for_me.message',
    defaultMessage:
      'This message disappears from your screen only. Other people still see it, and you cannot get it back.',
  },
  confirmDeleteForMeConfirm: {
    id: 'confirmations.messages.delete_for_me.confirm',
    defaultMessage: 'Delete',
  },

  confirmRedraftTitle: {
    id: 'confirmations.messages.redraft.title',
    defaultMessage: 'Delete and re-draft this message?',
  },
  confirmRedraftMessage: {
    id: 'confirmations.messages.redraft.message',
    defaultMessage:
      'The message disappears for everyone and its text comes back to the input box. If the other person already read it, that cannot be undone.',
  },
  confirmRedraftConfirm: {
    id: 'confirmations.messages.redraft.confirm',
    defaultMessage: 'Delete & re-draft',
  },
});

interface Props {
  statusId: string;
  isMine: boolean;

  // "나에게서만 삭제" 는 방 안의 경로다(POST …/dm_rooms/:id/statuses/:id/hide).
  // 없으면 그 항목을 넣지 않는다 — 운영진 열람 화면처럼 방 맥락이 없는 자리다.
  roomId?: string;

  // 화면에서 수신자 핸들을 지운 뒤의 본문 HTML. 복사도 화면과 같아야 한다 —
  // 보이지 않는 핸들이 붙어 나오면 붙여넣은 곳에서 그것이 멘션이 된다.
  contentHtml?: string;

  // 편집·다시 쓰기는 **방이 한다.** 둘 다 DM 입력창의 상태를 바꾸는 일이라,
  // 초안을 들고 있는 room.tsx 말고는 할 수 있는 곳이 없다.
  onEdit?: (statusId: string) => void;
  onRedraft?: (statusId: string) => void;
}

export const MessageMenu: React.FC<Props> = ({
  statusId,
  isMine,
  roomId,
  contentHtml,
  onEdit,
  onRedraft,
}) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();

  const handleCopy = useCallback(() => {
    const text = contentHtml ? unescapeHTML(contentHtml) : '';

    if (!text) return;

    // 실패해도(권한 없음·비보안 컨텍스트) 조용히 넘어간다. 복사 실패를 알리는
    // 배너를 띄우면 사용자가 할 수 있는 일이 없는데 화면만 가린다.
    void navigator.clipboard.writeText(text).catch(() => undefined);
  }, [contentHtml]);

  // 내 화면에서만 사라진다. 되살리는 화면이 없으므로 확인을 받는다.
  const handleDeleteForMe = useCallback(() => {
    if (!roomId) return;

    dispatch(
      openModal({
        modalType: 'CONFIRM',
        modalProps: {
          title: intl.formatMessage(messages.confirmDeleteForMeTitle),
          message: intl.formatMessage(messages.confirmDeleteForMeMessage),
          confirm: intl.formatMessage(messages.confirmDeleteForMeConfirm),
          dangerous: true,
          onConfirm: () => {
            void dispatch(hideDmMessage({ roomId, statusId }));
          },
        },
      }),
    );
  }, [dispatch, intl, roomId, statusId]);

  // 상대에게서도 사라진다. 되돌릴 수 없으므로 확인 모달을 거친다.
  const handleDeleteForEveryone = useCallback(() => {
    dispatch(
      openModal({
        modalType: 'CONFIRM_DELETE_STATUS',
        modalProps: { statusId, withRedraft: false },
      }),
    );
  }, [dispatch, statusId]);

  const handleEdit = useCallback(() => {
    onEdit?.(statusId);
  }, [onEdit, statusId]);

  // `CONFIRM_DELETE_STATUS` 를 쓰지 않는다. 그 모달은 확인 뒤에 반드시 상류의
  // `deleteStatus(id, true)` 를 부르고(동작을 바꿀 prop 이 없다), 그것은 원문을
  // **툿 작성창**에 넣는다 — 이 화면에서는 감춰져 있어 글이 사라진 것처럼 보인다.
  // 문구도 "즐겨찾기와 재게시가 사라진다" 라 채팅에는 맞지 않는다.
  const handleRedraft = useCallback(() => {
    dispatch(
      openModal({
        modalType: 'CONFIRM',
        modalProps: {
          title: intl.formatMessage(messages.confirmRedraftTitle),
          message: intl.formatMessage(messages.confirmRedraftMessage),
          confirm: intl.formatMessage(messages.confirmRedraftConfirm),
          dangerous: true,
          onConfirm: () => {
            onRedraft?.(statusId);
          },
        },
      }),
    );
  }, [dispatch, intl, onRedraft, statusId]);

  const items = useMemo(() => {
    const menu: MenuItem[] = [];

    if (isMine) {
      // 순서는 위험도 순이다. 되돌릴 수 없는 것이 아래로 간다.
      if (onEdit) {
        menu.push({
          text: intl.formatMessage(messages.edit),
          action: handleEdit,
        });
      }

      if (roomId) {
        menu.push({
          text: intl.formatMessage(messages.deleteForMe),
          action: handleDeleteForMe,
          dangerous: true,
        });
      }

      menu.push({
        text: intl.formatMessage(messages.deleteForEveryone),
        action: handleDeleteForEveryone,
        dangerous: true,
      });

      if (onRedraft) {
        menu.push({
          text: intl.formatMessage(messages.redraft),
          action: handleRedraft,
          dangerous: true,
        });
      }
    } else {
      // 본문이 있을 때만 넣는다. 첨부만 있는 메시지에 "복사하기" 를 띄우면
      // 눌러도 아무 일이 없다.
      if (contentHtml?.trim()) {
        menu.push({
          text: intl.formatMessage(messages.copy),
          action: handleCopy,
        });
      }

      if (roomId) {
        menu.push({
          text: intl.formatMessage(messages.deleteForMe),
          action: handleDeleteForMe,
          dangerous: true,
        });
      }
    }

    return menu;
  }, [
    contentHtml,
    handleCopy,
    handleDeleteForEveryone,
    handleDeleteForMe,
    handleEdit,
    handleRedraft,
    intl,
    isMine,
    onEdit,
    onRedraft,
    roomId,
  ]);

  // 넣을 것이 하나도 없으면 버튼을 그리지 않는다 — 눌러도 빈 상자만 열리는
  // 버튼은 고장으로 보인다.
  if (items.length === 0) return null;

  return (
    <div className='dm-message__menu'>
      <Dropdown
        items={items}
        icon='ellipsis-h'
        iconComponent={MoreHorizIcon}
        title={intl.formatMessage(messages.more)}
      />
    </div>
  );
};
