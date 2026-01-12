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
import { setActiveAccountToken } from 'mastodon/api';
import {
  hydrateStore as hydrateMultiAccountStore,
  attachPersistence as attachMultiAccountPersistence,
} from 'mastodon/utils/multi_account_storage';

const title = isProduction() ? siteTitle : `${siteTitle} (Dev)`;

const hydrateAction = hydrateStore(initialState);

store.dispatch(hydrateAction);
if (initialState.meta.me) {
  store.dispatch(fetchCustomEmojis());
}

void hydrateMultiAccountStore(store).then(() => {
  attachMultiAccountPersistence(store);
});

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
    const permissions = state.getIn(['role', 'permissions']) ?? 0;
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
