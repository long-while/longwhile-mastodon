import { IntlProvider } from 'react-intl';

import { MemoryRouter, useHistory, useLocation } from 'react-router-dom';

import { fireEvent, render, screen } from '@testing-library/react';
import type { Location } from 'history';

import { TimelineTabs } from '../timeline_tabs';

interface Seen {
  location?: Location;
  action?: string;
}

// 지금 주소와 마지막 이동 방식(push/replace)을 바깥에서 볼 수 있게 적어 둔다.
const LocationSpy: React.FC<{ seen: Seen }> = ({ seen }) => {
  seen.location = useLocation();
  seen.action = useHistory().action;
  return null;
};

// test_helpers 의 render 는 MemoryRouter 를 고정해서 감싸므로, 시작 주소를
// 정하려면 라우터를 직접 둔다.
const renderTabs = (path: string, onActiveClick = vi.fn()) => {
  const seen: Seen = {};

  const result = render(
    <IntlProvider locale='en'>
      <MemoryRouter initialEntries={['/notifications', path]} initialIndex={1}>
        <TimelineTabs onActiveClick={onActiveClick} />
        <LocationSpy seen={seen} />
      </MemoryRouter>
    </IntlProvider>,
  );

  return { ...result, seen, onActiveClick };
};

describe('<TimelineTabs />', () => {
  it('marks the tab for the current path', () => {
    renderTabs('/public');

    expect(
      screen.getByRole('link', { name: 'Public' }).getAttribute('aria-current'),
    ).toBe('page');
    expect(
      screen.getByRole('link', { name: 'Home' }).getAttribute('aria-current'),
    ).toBeNull();
  });

  it('switches tabs without adding a history entry', () => {
    const { seen } = renderTabs('/home');

    fireEvent.click(screen.getByRole('link', { name: 'Public' }));

    expect(seen.location?.pathname).toBe('/public');
    expect(seen.action).toBe('REPLACE');
  });

  it('calls onActiveClick instead of navigating when the active tab is tapped', () => {
    const { seen, onActiveClick } = renderTabs('/home');
    const before = seen.location?.key;

    fireEvent.click(screen.getByRole('link', { name: 'Home' }));

    expect(onActiveClick).toHaveBeenCalledTimes(1);
    expect(seen.location?.key).toBe(before);
  });
});
