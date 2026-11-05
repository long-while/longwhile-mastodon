import { PureComponent } from 'react';

import { Helmet } from 'react-helmet';
import { Route } from 'react-router-dom';

import { Provider as ReduxProvider } from 'react-redux';

import { ScrollContext } from 'react-router-scroll-4';

import { fetchCustomEmojis } from 'mastodon/actions/custom_emojis';
import { hydrateStore } from 'mastodon/actions/store';
import { connectUserStream } from 'mastodon/actions/streaming';
import ErrorBoundary from 'mastodon/components/error_boundary';
import { Router } from 'mastodon/components/router';
import UI from 'mastodon/features/ui';
import { IdentityContext, createIdentityContext } from 'mastodon/identity_context';
import initialState, { title as siteTitle, getAccessToken } from 'mastodon/initial_state';
import { IntlProvider } from 'mastodon/locales';
import { store } from 'mastodon/store';
import { isProduction } from 'mastodon/utils/environment';
import { remembersOwnScroll } from 'mastodon/utils/scroll_anchor';
import { setActiveAccountToken } from 'mastodon/api';
import { hydrateStore as hydrateMultiAccountStore } from 'mastodon/utils/multi_account_storage';

const title = isProduction() ? siteTitle : `${siteTitle} (Dev)`;

const hydrateAction = hydrateStore(initialState);

store.dispatch(hydrateAction);
if (initialState.meta.me) {
  store.dispatch(fetchCustomEmojis());
}

void hydrateMultiAccountStore(store);

const bootstrapToken = getAccessToken();
if (bootstrapToken) {
  setActiveAccountToken(bootstrapToken);
}

export default class Mastodon extends PureComponent {
  identity = createIdentityContext(initialState);
  unsubscribeStore = null;

  updateIdentityFromStore = () => {
    const state = store.getState();

    const accountId = state.getIn(['meta', 'me']);
    const disabledAccountId = state.getIn(['meta', 'disabled_account_id']);
    // @_longwhile — **리덕스에는 `role` 이 없다.** 그런 리듀서가 아예 없어서
    //   `state.getIn(['role', 'permissions'])` 는 늘 undefined 이고, `?? 0` 이
    //   그것을 0 으로 굳힌다.
    //
    //   부팅 때는 createIdentityContext(initialState) 가 제대로 넣어 주는데,
    //   이 함수는 store.subscribe 로 걸려 있어 **스토어가 한 번이라도 바뀌면**
    //   그 값을 0 으로 덮는다. 그래서 권한으로 갈리는 항목이 처음에는 보이다가
    //   사라지거나, 실제로는 아예 안 보인다 — 운영진 전용 "모든 채팅" 이
    //   내비에 나오지 않던 원인이다.
    //
    //   스토어에 없으면 부팅값을 그대로 쓴다. 역할은 런타임에 바뀌지 않는다.
    const permissions =
      state.getIn(['role', 'permissions']) ?? initialState.role?.permissions ?? 0;
    const signedIn = !!accountId;

    if (
      this.identity.accountId !== accountId ||
      this.identity.disabledAccountId !== disabledAccountId ||
      this.identity.permissions !== permissions ||
      this.identity.signedIn !== signedIn
    ) {
      this.identity = {
        signedIn,
        accountId,
        disabledAccountId,
        permissions,
      };
      this.forceUpdate();
    }
  };

  componentDidMount() {
    this.unsubscribeStore = store.subscribe(this.updateIdentityFromStore);
    if (this.identity.signedIn) {
      this.disconnect = store.dispatch(connectUserStream());
    }
  }

  componentWillUnmount () {
    if (this.disconnect) {
      this.disconnect();
      this.disconnect = null;
    }
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
  }

  shouldUpdateScroll (prevRouterProps, { location }) {
    if (remembersOwnScroll(prevRouterProps?.location?.pathname, location.pathname)) {
      return false;
    }

    return !(location.state?.mastodonModalKey && location.state?.mastodonModalKey !== prevRouterProps?.location?.state?.mastodonModalKey);
  }

  render () {
    return (
      <IdentityContext.Provider value={this.identity}>
        <IntlProvider>
          <ReduxProvider store={store}>
            <ErrorBoundary>
              <Router>
                <ScrollContext shouldUpdateScroll={this.shouldUpdateScroll}>
                  <Route path='/' component={UI} />
                </ScrollContext>
              </Router>

              <Helmet defaultTitle={title} titleTemplate={`%s - ${title}`} />
            </ErrorBoundary>
          </ReduxProvider>
        </IntlProvider>
      </IdentityContext.Provider>
    );
  }

}
