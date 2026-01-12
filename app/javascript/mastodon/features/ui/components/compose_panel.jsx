import { useCallback, useEffect } from 'react';

import { useDispatch } from 'react-redux';

import { changeComposing, mountCompose, unmountCompose } from 'mastodon/actions/compose';
import ServerBanner from 'mastodon/components/server_banner';
import { Search } from 'mastodon/features/compose/components/search';
import ComposeFormContainer from 'mastodon/features/compose/containers/compose_form_container';
import { LinkFooter } from 'mastodon/features/ui/components/link_footer';
import { withIdentity } from 'mastodon/identity_context';
import { useBreakpoint } from 'mastodon/hooks/useBreakpoint';

const ComposePanel = ({ identity }) => {
  const dispatch = useDispatch();
  const { signedIn } = identity;

  const showSearch = !useBreakpoint('full');

  useEffect(() => {
    dispatch(mountCompose());

    return () => {
      dispatch(unmountCompose());
    };
  }, [dispatch]);

  const handleFocus = useCallback(() => {
    dispatch(changeComposing(true));
  }, [dispatch]);

  const handleBlur = useCallback(() => {
    dispatch(changeComposing(false));
  }, [dispatch]);

  return (
    <div className='compose-panel' onFocus={handleFocus} onBlur={handleBlur}>
      {showSearch && <Search openInRoute singleColumn />}

      {!signedIn && (
        <>
          <ServerBanner />
          <div className='flex-spacer' />
        </>
      )}

      {signedIn && (
        <ComposeFormContainer singleColumn />
      )}

      <LinkFooter />
    </div>
  );
};

export default withIdentity(ComposePanel);
