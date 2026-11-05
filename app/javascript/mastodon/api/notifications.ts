import api, {
  apiRequest,
  getLinks,
  apiRequestGet,
  apiRequestPost,
} from 'mastodon/api';
import type {
  ApiNotificationGroupsResultJSON,
  ApiNotificationRequestJSON,
  ApiNotificationJSON,
} from 'mastodon/api_types/notifications';

// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//
//   **DM 을 알림함에서 빼는 것은 이제 여기서 한다.** 서버는 기본으로 내려준다.
//
//   한때는 서버가 기본으로 걸렀는데, 그러면 **파라미터를 모르는 클라이언트가
//   전부 막힌다** — 공식 모바일 앱의 알림 탭에 DM 이 아예 안 뜨던 것이 그것이다.
//   앱은 고칠 수 없으니 방향을 뒤집었다. 보이는 것이 기본이고, 빼는 쪽이 말한다.
//   말하는 것은 이 파일 하나뿐이다. (Notification.browserable 의 주석)
//
//   **호출부가 아니라 이 파일에 박는다.** 알림함으로 가는 요청이 여기를 전부
//   지나가므로, 여기 두면 새 화면이 생겨도 빠뜨릴 곳이 없다. 다음 페이지는
//   서버가 준 링크를 그대로 따라가는데 그 링크에도 같은 파라미터가 실려 있다
//   (notifications_controller 의 pagination_params).
//
//   기능이 꺼져 있으면 서버가 이 값을 무시하므로 조건 없이 보낸다.
const EXCLUDE_DIRECT_MESSAGES = { exclude_direct_messages: true };

export const apiFetchNotifications = async (
  params?: {
    account_id?: string;
    since_id?: string;
  },
  url?: string,
) => {
  const response = await api().request<ApiNotificationJSON[]>({
    method: 'GET',
    url: url ?? '/api/v1/notifications',
    params: { ...EXCLUDE_DIRECT_MESSAGES, ...params },
  });

  return {
    notifications: response.data,
    links: getLinks(response),
  };
};

export const apiFetchNotificationGroups = async (params?: {
  url?: string;
  grouped_types?: string[];
  exclude_types?: string[];
  max_id?: string;
  since_id?: string;
}) => {
  const response = await api().request<ApiNotificationGroupsResultJSON>({
    method: 'GET',
    url: '/api/v2/notifications',
    params: { ...EXCLUDE_DIRECT_MESSAGES, ...params },
  });

  const { statuses, accounts, notification_groups } = response.data;

  return {
    statuses,
    accounts,
    notifications: notification_groups,
    links: getLinks(response),
  };
};

export const apiClearNotifications = () =>
  apiRequest<undefined>('POST', 'v1/notifications/clear');

export const apiFetchNotificationRequests = async (
  params?: {
    since_id?: string;
  },
  url?: string,
) => {
  const response = await api().request<ApiNotificationRequestJSON[]>({
    method: 'GET',
    url: url ?? '/api/v1/notifications/requests',
    params,
  });

  return {
    requests: response.data,
    links: getLinks(response),
  };
};

export const apiFetchNotificationRequest = async (id: string) => {
  return apiRequestGet<ApiNotificationRequestJSON>(
    `v1/notifications/requests/${id}`,
  );
};

export const apiAcceptNotificationRequest = async (id: string) => {
  return apiRequestPost(`v1/notifications/requests/${id}/accept`);
};

export const apiDismissNotificationRequest = async (id: string) => {
  return apiRequestPost(`v1/notifications/requests/${id}/dismiss`);
};

export const apiAcceptNotificationRequests = async (id: string[]) => {
  return apiRequestPost('v1/notifications/requests/accept', { id });
};

export const apiDismissNotificationRequests = async (id: string[]) => {
  return apiRequestPost('v1/notifications/requests/dismiss', { id });
};
