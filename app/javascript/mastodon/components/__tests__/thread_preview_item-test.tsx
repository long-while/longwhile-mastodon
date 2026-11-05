import { IntlProvider } from 'react-intl';

import { MemoryRouter } from 'react-router-dom';

import { fromJS, Map as ImmutableMap } from 'immutable';
import { Provider } from 'react-redux';

import { render, screen } from '@testing-library/react';

import type { ThreadHeadState } from '../../reducers/thread_heads';
import { ThreadPreviewItem } from '../thread_preview_item';

vi.mock('mastodon/containers/status_container', () => ({
  default: (props: Record<string, unknown>) => (
    <div
      data-testid={props.threadHead ? 'head' : 'reply'}
      data-id={props.id as string}
      data-show-thread={String(props.showThread)}
      data-previous-id={(props.previousId as string | undefined) ?? ''}
      data-thread-head={String(!!props.threadHead)}
    />
  ),
}));

const hiddenByFilter = new Set<string>();
vi.mock('mastodon/selectors', () => ({
  makeGetStatus:
    () =>
    (_state: unknown, { id }: { id: string }) =>
      hiddenByFilter.has(id) ? null : ImmutableMap({ id }),
}));

const statuses = {
  '1': { id: '1', in_reply_to_id: null, reblog: null },
  '2': { id: '2', in_reply_to_id: '1', reblog: null },
  '5': { id: '5', in_reply_to_id: '4', reblog: null },
  '9': { id: '9', in_reply_to_id: null, reblog: '5' },
};

const renderItem = (id: string, heads: Record<string, ThreadHeadState>) => {
  const state = ImmutableMap<string, unknown>({
    statuses: fromJS(statuses),
    thread_heads: heads,
  });
  const store = {
    getState: () => state,
    subscribe: () => () => undefined,
    dispatch: vi.fn(),
  };

  return render(
    <Provider store={store as never}>
      <IntlProvider locale='en'>
        <MemoryRouter>
          <ThreadPreviewItem id={id} contextType='home' />
        </MemoryRouter>
      </IntlProvider>
    </Provider>,
  );
};

beforeEach(() => {
  hiddenByFilter.clear();
});

describe('<ThreadPreviewItem />', () => {
  it('renders a post that is not a reply as before', () => {
    renderItem('1', {});

    expect(screen.queryByTestId('head')).toBeNull();
    expect(screen.getByTestId('reply').dataset.showThread).toBe('true');
  });

  it('keeps the "replying to" line while the head is loading, missing or failed', () => {
    for (const state of [undefined, 'pending', 'none'] as const) {
      const { unmount } = renderItem('2', state ? { '2': state } : {});

      expect(screen.queryByTestId('head')).toBeNull();
      expect(screen.getByTestId('reply').dataset.showThread).toBe('true');
      unmount();
    }
  });

  it('draws head + reply joined by a solid line for a chain of two', () => {
    renderItem('2', { '2': { headId: '1', omitted: 0 } });

    const head = screen.getByTestId('head');
    const reply = screen.getByTestId('reply');

    expect(head.dataset.id).toBe('1');
    expect(head.dataset.threadHead).toBe('true');
    expect(reply.dataset.id).toBe('2');
    expect(reply.dataset.showThread).toBe('false');
    expect(reply.dataset.previousId).toBe('1');
    expect(
      screen.queryByRole('link', { name: 'Show more replies' }),
    ).toBeNull();
  });

  it('adds "show more replies" to the reply\'s detail page for a longer chain', () => {
    renderItem('5', { '5': { headId: '1', omitted: 2 } });

    expect(screen.getByTestId('head').dataset.id).toBe('1');
    expect(
      screen
        .getByRole('link', { name: 'Show more replies' })
        .getAttribute('href'),
    ).toBe('/statuses/5');
    expect(screen.getByTestId('reply').dataset.previousId).toBe('4');
  });

  it('looks up a boosted reply by the boosted post', () => {
    renderItem('9', { '5': { headId: '1', omitted: 2 } });

    expect(screen.getByTestId('head').dataset.id).toBe('1');
    expect(screen.getByTestId('reply').dataset.id).toBe('9');
    expect(
      screen
        .getByRole('link', { name: 'Show more replies' })
        .getAttribute('href'),
    ).toBe('/statuses/5');
  });

  it('drops a head hidden by a filter and keeps the "replying to" line', () => {
    hiddenByFilter.add('1');
    renderItem('2', { '2': { headId: '1', omitted: 0 } });

    expect(screen.queryByTestId('head')).toBeNull();
    expect(screen.getByTestId('reply').dataset.showThread).toBe('true');
  });

  it('keeps the timeline item owned by the reply (head is inside, not a sibling article)', () => {
    const { container } = renderItem('2', { '2': { headId: '1', omitted: 0 } });
    const root = container.firstElementChild;

    expect(root?.classList.contains('thread-preview')).toBe(true);
    expect(root?.querySelectorAll('[data-testid]')).toHaveLength(2);
    expect(
      root?.lastElementChild?.querySelector('[data-testid="reply"]'),
    ).not.toBeNull();
  });
});
