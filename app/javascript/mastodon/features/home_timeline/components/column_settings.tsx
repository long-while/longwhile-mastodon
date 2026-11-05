/* eslint-disable @typescript-eslint/no-unsafe-call,
                  @typescript-eslint/no-unsafe-return,
                  @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-unsafe-member-access
                  -- the settings store is not yet typed */
import { useCallback } from 'react';

import { FormattedMessage } from 'react-intl';

import { setExpandContentWarnings } from 'mastodon/actions/statuses';
import { useAppSelector, useAppDispatch } from 'mastodon/store';

import { changeSetting } from '../../../actions/settings';
import SettingToggle from '../../notifications/components/setting_toggle';

export const ColumnSettings: React.FC = () => {
  const settings = useAppSelector((state) => state.settings.get('home'));

  // 콘텐츠 워닝 설정은 홈 아래가 아니라 따로 둡니다. **모든 화면에 걸리기**
  // 때문입니다 — 토글 자리가 여기일 뿐입니다. (reducers/settings.js 주석 참조)
  const contentWarningSettings = useAppSelector((state) =>
    state.settings.get('content_warnings'),
  );

  const dispatch = useAppDispatch();
  const onChange = useCallback(
    (key: string[], checked: boolean) => {
      dispatch(changeSetting(['home', ...key], checked));
    },
    [dispatch],
  );

  // 설정만 바꾸지 않고 이미 받아둔 글에도 바로 적용합니다. 그러지 않으면 켠
  // 직후에는 아무 일도 일어나지 않아 고장으로 보입니다.
  const onChangeExpandContentWarnings = useCallback(
    (_key: string[], checked: boolean) => {
      dispatch(setExpandContentWarnings(checked));
    },
    [dispatch],
  );

  return (
    <div className='column-settings'>
      <section>
        <div className='column-settings__row'>
          <SettingToggle
            prefix='home_timeline'
            settings={settings}
            settingPath={['shows', 'reblog']}
            onChange={onChange}
            label={
              <FormattedMessage
                id='home.column_settings.show_reblogs'
                defaultMessage='Show boosts'
              />
            }
          />

          <SettingToggle
            prefix='home_timeline'
            settings={settings}
            settingPath={['shows', 'reply']}
            onChange={onChange}
            label={
              <FormattedMessage
                id='home.column_settings.show_replies'
                defaultMessage='Show replies'
              />
            }
          />

          {/* @_longwhile — 워닝을 매번 눌러 여는 것이 번거로운 사용자를 위한
              설정. 기본값은 끔입니다. 켜면 앞으로 받는 글도, 지금 화면에 있는
              글도 함께 펼쳐집니다. */}
          <SettingToggle
            prefix='home_timeline'
            settings={contentWarningSettings}
            settingPath={['expand_all']}
            defaultValue={false}
            onChange={onChangeExpandContentWarnings}
            label={
              <FormattedMessage
                id='home.column_settings.expand_content_warnings'
                defaultMessage='Expand all content warnings'
              />
            }
          />
        </div>
      </section>
    </div>
  );
};
