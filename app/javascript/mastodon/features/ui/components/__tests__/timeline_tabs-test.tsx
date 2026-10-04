import { IntlProvider } from 'react-intl';

import { MemoryRouter, useHistory, useLocation } from 'react-router-dom';

import { fireEvent, render, screen } from '@testing-library/react';
import type { Location } from 'history';

import { TimelineTabs } from '../timeline_tabs';

interface Seen {
  location?: Location;
  action?: string;
}

const LocationSpy: React.FC<{ seen: Seen }> = ({ seen }) => {
  seen.location = useLocation();
  seen.action = useHistory().action;
  return null;
};

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
