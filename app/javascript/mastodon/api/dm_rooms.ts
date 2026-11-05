// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅

import api, {
  apiRequest,
  apiRequestGet,
  apiRequestPost,
  apiRequestDelete,
  getLinks,
} from 'mastodon/api';
import type { ApiDmRoomJSON } from 'mastodon/api_types/dm_rooms';
import type { ApiStatusJSON } from 'mastodon/api_types/statuses';

export const apiGetDmRooms = async (url?: string) => {
  const response = await api().request<ApiDmRoomJSON[]>({
    method: 'GET',
    url: url ?? '/api/v1/dm_rooms',
  });

  return {
    rooms: response.data,
    links: getLinks(response),
  };
};

export const apiGetDmRoom = (roomId: string) =>
  apiRequestGet<ApiDmRoomJSON>(`v1/dm_rooms/${roomId}`);

export const apiCreateDmRoom = (accountIds: string[]) =>
  apiRequestPost<ApiDmRoomJSON>('v1/dm_rooms', { account_ids: accountIds });

// 목록에서 숨긴다. 방과 메시지는 그대로 남고, 새 메시지가 오면 다시 나타난다.
export const apiLeaveDmRoom = (roomId: string) =>
  apiRequestDelete(`v1/dm_rooms/${roomId}`);

// 방 제목 (Phase 5). 빈 문자열이면 제목 삭제다 — 서버가 strip 후 nil 로 저장한다.
// 제목이 실제로 바뀌었을 때만 방에 안내 메시지가 남는다.
export const apiSetDmRoomTitle = (roomId: string, title: string) =>
  apiRequest<ApiDmRoomJSON>('PATCH', `v1/dm_rooms/${roomId}/title`, {
    data: { title },
  });

export const apiMarkDmRoomRead = (roomId: string, statusId?: string) =>
  apiRequestPost<ApiDmRoomJSON>(
    `v1/dm_rooms/${roomId}/read`,
    statusId ? { status_id: statusId } : {},
  );

// 메시지 전송은 기존 POST /api/v1/statuses 를 그대로 쓴다. 전용 엔드포인트를 만들면
// 공식 앱과 서드파티에서 우리 메시지가 다르게 보인다. (기획서 §7.5)
//
// 공개 범위는 direct 로 고정한다. 선택지를 노출하지 않는 것이 FR-12 다.
//
// 수신자는 본문 앞의 멘션으로 정해진다 — 마스토돈은 direct 글을 "본문에 멘션된
// 사람" 에게 배달한다. 그래서 핸들을 본문에 실제로 넣어야 하고, 화면에서는 그
// 선두 멘션을 지워서 보여준다(FR-13). allowed_mentions 는 거기에 더해, 답장을
// 이어받으며 딸려온 다른 핸들이 조용히 수신자가 되는 것을 막는다.
//
// 멱등성 키를 함께 보낸다. 서버는 그 키를 계정별로 1시간 보관하고, 같은 키로 다시
// 오면 새로 만들지 않고 기존 글을 돌려준다(PostStatusService). **재시도 때 같은
// 키를 써야** 첫 요청이 사실은 성공했던 경우(응답만 유실) 같은 메시지가 두 번
// 나가지 않는다. 그래서 키는 낙관적 말풍선과 함께 보관한다.
// (dm-chat-phase-3.md §3.4, 기획서 §11.4)
export const apiSendDmMessage = async (params: {
  text: string;
  inReplyToId?: string;
  recipientAccts: string[];
  recipientIds: string[];
  mediaIds?: string[];
  idempotencyKey?: string;
}) => {
  const mentions = params.recipientAccts.map((acct) => `@${acct}`).join(' ');

  // apiRequestPost 로는 헤더를 실을 수 없다. 기존 툿 작성창도 같은 이유로
  // api().request 를 직접 쓴다 (actions/compose.js).
  const response = await api().request<ApiStatusJSON>({
    method: 'POST',
    url: '/api/v1/statuses',
    headers: params.idempotencyKey
      ? { 'Idempotency-Key': params.idempotencyKey }
      : undefined,
    data: {
      // 첨부만 보낼 때도 수신자 멘션은 반드시 들어가야 한다. 마스토돈은 direct 글을
      // "본문에 멘션된 사람" 에게 배달하므로, 본문이 비면 아무에게도 가지 않는다.
      status: [mentions, params.text].filter(Boolean).join(' '),
      visibility: 'direct',
      in_reply_to_id: params.inReplyToId,
      allowed_mentions: params.recipientIds,
      media_ids: params.mediaIds?.length ? params.mediaIds : undefined,
    },
  });

  return response.data;
};

// ── 멤버 관리 (2026-08-12) ─────────────────────────────────────────────────
//
// 셋 다 응답이 **갱신된 방**이다. 멤버 목록·별명·방장을 한 번에 다시 받아야
// 화면이 어긋나지 않는다.

// 초대. **방은 그대로다** — 서버가 participant_key 를 다시 계산해 같은 행에
// 쓴다. 새로 들어온 사람은 들어오기 전 메시지를 볼 수 없다(따로 막은 것이
// 아니라, 옛 글에 그 사람이 멘션되어 있지 않아 저절로 그렇게 된다).
export const apiAddDmRoomMembers = (roomId: string, accountIds: string[]) =>
  apiRequestPost<ApiDmRoomJSON>(`v1/dm_rooms/${roomId}/members`, {
    account_ids: accountIds,
  });

// 내보내기. **방장만 할 수 있다**(서버가 403 으로 막는다).
//
// 나가기(`apiLeaveDmRoom`)와 다르다. 나가기는 목록에서만 감춰 새 메시지가 오면
// 되돌아오지만, 이쪽은 참여자 조합 자체가 바뀌어 되돌아올 수 없다.
export const apiRemoveDmRoomMember = (roomId: string, accountId: string) =>
  apiRequestDelete<ApiDmRoomJSON>(`v1/dm_rooms/${roomId}/members/${accountId}`);

// 별명. 빈 문자열이면 지운다. **지정한 나에게만 보인다.**
export const apiSetDmRoomNickname = (
  roomId: string,
  accountId: string,
  nickname: string,
) =>
  apiRequest<ApiDmRoomJSON>(
    'PUT',
    `v1/dm_rooms/${roomId}/members/${accountId}/nickname`,
    { data: { nickname } },
  );

// ── 메시지 하나에 대한 동작 (컨텍스트 메뉴) ────────────────────────────────

// "나에게서만 삭제". 서버에 (계정, 글) 한 행을 남기고, 이후 이 계정의 조회에서만
// 그 글이 빠진다. 상대에게는 그대로 남는다. 남의 메시지에도 쓸 수 있어서 방
// 안의 경로다 — 소유권이 아니라 "이 방에서 내가 볼 수 있는 글인가" 로 판정한다.
// (B-06, 마이그레이션 20260812000000)
export const apiHideDmMessage = (roomId: string, statusId: string) =>
  apiRequestPost(`v1/dm_rooms/${roomId}/statuses/${statusId}/hide`);

// 편집·다시 쓰기의 재료. 화면의 HTML 이 아니라 **작성 당시의 원문**이다.
// HTML 을 되돌려 만들면 줄바꿈과 이모지 단축코드가 사라진다.
export const apiGetDmMessageSource = (statusId: string) =>
  apiRequestGet<{ id: string; text: string; spoiler_text: string }>(
    `v1/statuses/${statusId}/source`,
  );

// 수정. 상류의 편집(PUT /api/v1/statuses/:id)을 그대로 쓴다 — 전용 경로를 만들면
// 편집 이력(status_edits)이 남지 않아 공식 앱에서 "수정됨" 표시가 사라진다.
//
// **수신자 핸들을 다시 붙여 보낸다.** 마스토돈은 direct 글을 본문에 멘션된
// 사람에게 배달하므로, 화면에서 지워 보여주던 그 핸들을 빼고 보내면 수정하는
// 순간 아무에게도 안 가는 글이 된다.
//
// `media_ids` 는 지금 붙어 있는 것을 그대로 다시 보낸다. 생략하면 서버가 첨부를
// 뗀다 — 글자만 고쳤는데 사진이 사라진다.
export const apiEditDmMessage = async (params: {
  statusId: string;
  text: string;
  recipientAccts: string[];
  mediaIds?: string[];
}) => {
  const mentions = params.recipientAccts.map((acct) => `@${acct}`).join(' ');

  return apiRequest<ApiStatusJSON>('PUT', `v1/statuses/${params.statusId}`, {
    data: {
      status: [mentions, params.text].filter(Boolean).join(' '),
      media_ids: params.mediaIds?.length ? params.mediaIds : undefined,
    },
  });
};

// "지우고 다시 쓰기". 상류와 같은 방식이다 — 지우면서 원문을 돌려받아 입력창에
// 넣는다. `delete_media=false` 라야 첨부가 남아 다시 붙일 수 있다.
export const apiDeleteDmMessageForRedraft = async (statusId: string) => {
  const response = await api().request<ApiStatusJSON & { text?: string }>({
    method: 'DELETE',
    url: `/api/v1/statuses/${statusId}`,
    params: { delete_media: false },
  });

  return response.data;
};

// 메시지는 서버가 시간 역순으로 준다. 화면은 위에서 아래로 시간순이라 리듀서에서
// 뒤집어 담는다. (dm-chat-phase-2.md §2)
export const apiGetDmRoomStatuses = async (
  roomId: string,
  options: { maxId?: string; sinceId?: string } = {},
) => {
  const response = await api().request<ApiStatusJSON[]>({
    method: 'GET',
    url: `/api/v1/dm_rooms/${roomId}/statuses`,
    params: {
      max_id: options.maxId,
      since_id: options.sinceId,
    },
  });

  return {
    statuses: response.data,
    links: getLinks(response),
  };
};
