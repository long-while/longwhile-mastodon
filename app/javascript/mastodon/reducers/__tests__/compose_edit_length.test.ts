import { fromJS } from 'immutable';

import { COMPOSE_SET_STATUS } from '../../actions/compose';
import { composeReducer as compose } from '../compose';

const editAction = (text: string, spoilerText = '') => ({
  type: COMPOSE_SET_STATUS,
  status: fromJS({
    id: '1',
    in_reply_to_id: null,
    visibility: 'public',
    media_attachments: [],
    sensitive: false,
    language: 'ko',
  }),
  text,
  spoiler_text: spoilerText,
  maxOptions: 4,
});

describe('compose reducer: edit_original_length', () => {
  it('records the original length (spoiler + body) when editing starts', () => {
    const state = compose(undefined, editAction('가나다라마', '경고'));

    expect(state.get('id')).toBe('1');
    expect(state.get('edit_original_length')).toBe(7);
  });

  it('counts a link as the fixed URL length, like the character counter', () => {
    const state = compose(
      undefined,
      editAction('https://example.com/a/very/long/path/that/is/long'),
    );

    expect(state.get('edit_original_length')).toBe(23);
  });
});
