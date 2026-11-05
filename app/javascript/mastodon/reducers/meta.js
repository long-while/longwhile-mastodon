import { Map as ImmutableMap } from 'immutable';

import { changeLayout } from 'mastodon/actions/app';
import { STORE_HYDRATE } from 'mastodon/actions/store';
import { layoutFromWindow } from 'mastodon/is_mobile';

const initialState = ImmutableMap({
  streaming_api_base_url: null,
  layout: layoutFromWindow(),
  permissions: '0',
});

// @_longwhile — **`me` 는 여기서 바꾸지 않는다.**
//   한때 다중 계정 부팅 코드가 localStorage 에 적힌 "마지막 전환 계정" 으로
//   `meta.me` 를 덮어썼다. 서버 세션이 다른 계정이면 화면의 '나' 와 실제로
//   요청이 나가는 계정이 갈라져, 계정 관리 목록의 초록 체크가 두 계정에 찍히고
//   전환 버튼이 둘 다 막혔다. 세션이 정한 값(STORE_HYDRATE)만 쓴다.
export default function meta(state = initialState, action) {
  switch(action.type) {
  case STORE_HYDRATE:
    // we do not want `access_token` to be stored in the state
    return state.merge(action.state.get('meta')).delete('access_token').set('permissions', action.state.getIn(['role', 'permissions']));
  case changeLayout.type:
    return state.set('layout', action.payload.layout);
  default:
    return state;
  }
}
