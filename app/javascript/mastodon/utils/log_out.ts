import api from 'mastodon/api';
import { MULTI_ACCOUNT_REQUEST_TIMEOUT } from 'mastodon/api/multi_accounts_constants';
import { clearDrafts } from 'mastodon/features/messages/util/drafts';
import { clearActiveAccountIdInStorage } from 'mastodon/utils/multi_account_storage';

export async function logOut() {
  // DM 초안은 로컬 저장소에 남는다. 공용 기기에서 다음 사람이 읽을 수 있으므로
  // 로그아웃과 함께 지운다. (dm-chat-phase-3.md §4, 기획서 §11.5)
  clearDrafts();

  // @_longwhile — "마지막으로 전환한 계정" 포인터도 같이 지운다. 남겨 두면
  // 다음에 **다른 계정으로** 로그인했을 때 세션과 어긋난 채로 되살아난다.
  clearActiveAccountIdInStorage();

  try {
    const response = await api(false).delete<{ redirect_to?: string }>(
      '/auth/sign_out',
      {
        headers: { Accept: 'application/json' },
        withCredentials: true,
        timeout: MULTI_ACCOUNT_REQUEST_TIMEOUT,
      },
    );

    if (response.status === 200 && response.data.redirect_to)
      window.location.href = response.data.redirect_to;
    else
      console.error(
        'Failed to log out, got an unexpected non-redirect response from the server',
        response,
      );
  } catch (error) {
    console.error('Failed to log out, response was an error', error);
  }
}
