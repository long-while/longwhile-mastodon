import { FormattedNumber } from 'react-intl';

import { render } from 'mastodon/test_helpers';

import { StatusesCounter } from '../counters';

describe('StatusesCounter with the full number', () => {
  it('renders the whole count with a thousands separator', () => {
    const { container } = render(
      StatusesCounter(<FormattedNumber value={12345} />, 12345),
    );

    expect(container.querySelector('strong')?.textContent).toBe('12,345');
    expect(container.textContent).toBe('12,345 Posts');
  });

  it('keeps the singular form for one post', () => {
    const { container } = render(
      StatusesCounter(<FormattedNumber value={1} />, 1),
    );

    expect(container.textContent).toBe('1 Post');
  });
});
