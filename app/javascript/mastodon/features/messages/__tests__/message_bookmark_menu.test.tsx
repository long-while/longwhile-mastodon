import { fromJS, List as ImmutableList, Map as ImmutableMap } from 'immutable';

import type { Status } from 'mastodon/models/status';
import { fireEvent, render, screen } from 'mastodon/test_helpers';

import { MessageBubble } from '../components/message_bubble';
import { MessageMenu } from '../components/message_menu';

const dispatch = vi.fn();
let statuses = ImmutableMap<string, Status>();

vi.mock('mastodon/store', () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ statuses }),
}));

vi.mock('mastodon/components/dropdown_menu', () => ({
  Dropdown: ({
    items,
  }: {
    items: ({ text: string; action: () => void } | null)[];
  }) => (
    <div data-testid='dropdown'>
      {items.map(
        (item) =>
          item && (
            <button key={item.text} type='button' onClick={item.action}>
              {item.text}
            </button>
          ),
      )}
    </div>
  ),
}));

vi.mock('mastodon/components/status_content', () => ({
  default: () => <div>content</div>,
}));
vi.mock('mastodon/components/media_gallery', () => ({ default: () => null }));
vi.mock('mastodon/features/status/components/card', () => ({
  default: () => null,
}));
vi.mock('../selectors', () => ({ selectMessageAccount: () => undefined }));

const ID = '55';

const makeStatus = (bookmarked: boolean): Status =>
  fromJS({
    id: ID,
    account: '2',
    bookmarked,
    contentHtml: '<p>hello</p>',
    spoiler_text: '',
    created_at: '2026-11-24T10:00:00.000Z',
    media_attachments: ImmutableList(),
  }) as unknown as Status;

beforeEach(() => {
  dispatch.mockReset();
  statuses = ImmutableMap<string, Status>();
});

describe('MessageMenu bookmark items', () => {
  it('offers bookmark and add-to-folder on someone else’s message', () => {
    statuses = statuses.set(ID, makeStatus(false));
    render(<MessageMenu statusId={ID} isMine={false} roomId='1' />);

    fireEvent.click(screen.getByRole('button', { name: 'Bookmark' }));
    expect(dispatch).toHaveBeenLastCalledWith(expect.any(Function));

    fireEvent.click(screen.getByRole('button', { name: 'Add to folder' }));
    expect(dispatch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          modalType: 'BOOKMARK_FOLDER_ADDER',
          modalProps: { statusId: ID },
        }) as unknown,
      }),
    );
  });

  it('offers remove-bookmark on my own bookmarked message', () => {
    statuses = statuses.set(ID, makeStatus(true));
    render(<MessageMenu statusId={ID} isMine roomId='1' />);

    expect(
      screen.getByRole('button', { name: 'Remove bookmark' }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Bookmark' })).toBeNull();
  });

  it('leaves the bookmark items out when the status is not loaded', () => {
    render(<MessageMenu statusId={ID} isMine={false} roomId='1' />);

    expect(screen.queryByRole('button', { name: 'Add to folder' })).toBeNull();
  });
});

describe('MessageBubble menu', () => {
  const renderBubble = (readOnly: boolean) => {
    const status = makeStatus(false);
    statuses = statuses.set(ID, status);

    render(
      <MessageBubble
        status={status}
        memberUrls={new Set()}
        isMine={false}
        isFirstInGroup
        isLastInGroup
        isSenderChanged={false}
        showTimestamp={false}
        showSenderName={false}
        roomId={readOnly ? undefined : '1'}
        readOnly={readOnly}
      />,
    );
  };

  it('shows the bookmark items to participants', () => {
    renderBubble(false);

    expect(screen.getByRole('button', { name: 'Bookmark' })).toBeTruthy();
  });

  it('hides them in the staff read-only view', () => {
    renderBubble(true);

    expect(screen.queryByTestId('dropdown')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bookmark' })).toBeNull();
  });
});
