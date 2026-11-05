import PropTypes from 'prop-types';
import { PureComponent } from 'react';

import { Helmet } from 'react-helmet';

import Base from 'mastodon/components/modal_root';
import { AltTextModal } from 'mastodon/features/alt_text_modal';
import {
  MuteModal,
  BlockModal,
  DomainBlockModal,
  ReportModal,
  EmbedModal,
  ListAdder,
  CompareHistoryModal,
  FilterModal,
  InteractionModal,
  SubscribedLanguagesModal,
  ClosedRegistrationsModal,
  IgnoreNotificationsModal,
  AnnualReportModal,
  ScheduleModal,
  DmRecipientModal,
  DmMemberModal,
  ReplyRecipientsModal,
} from 'mastodon/features/ui/util/async-components';

import BundleContainer from '../containers/bundle_container';

import { ActionsModal } from './actions_modal';
import AudioModal from './audio_modal';
import { BoostModal } from './boost_modal';
import {
  ConfirmationModal,
  ConfirmDeleteStatusModal,
  ConfirmDeleteListModal,
  ConfirmReplyModal,
  ConfirmEditStatusModal,
  ConfirmUnfollowModal,
  ConfirmClearNotificationsModal,
  ConfirmLogOutModal,
  ConfirmFollowToListModal,
  ConfirmMissingAltTextModal,
} from './confirmation_modals';
import { ImageModal } from './image_modal';
import MediaModal from './media_modal';
import { ModalPlaceholder } from './modal_placeholder';
import VideoModal from './video_modal';

export const MODAL_COMPONENTS = {
  'MEDIA': () => Promise.resolve({ default: MediaModal }),
  'VIDEO': () => Promise.resolve({ default: VideoModal }),
  'AUDIO': () => Promise.resolve({ default: AudioModal }),
  'IMAGE': () => Promise.resolve({ default: ImageModal }),
  'BOOST': () => Promise.resolve({ default: BoostModal }),
  'CONFIRM': () => Promise.resolve({ default: ConfirmationModal }),
  'CONFIRM_DELETE_STATUS': () => Promise.resolve({ default: ConfirmDeleteStatusModal }),
  'CONFIRM_DELETE_LIST': () => Promise.resolve({ default: ConfirmDeleteListModal }),
  'CONFIRM_REPLY': () => Promise.resolve({ default: ConfirmReplyModal }),
  'CONFIRM_EDIT_STATUS': () => Promise.resolve({ default: ConfirmEditStatusModal }),
  'CONFIRM_UNFOLLOW': () => Promise.resolve({ default: ConfirmUnfollowModal }),
  'CONFIRM_CLEAR_NOTIFICATIONS': () => Promise.resolve({ default: ConfirmClearNotificationsModal }),
  'CONFIRM_LOG_OUT': () => Promise.resolve({ default: ConfirmLogOutModal }),
  'CONFIRM_FOLLOW_TO_LIST': () => Promise.resolve({ default: ConfirmFollowToListModal }),
  'CONFIRM_MISSING_ALT_TEXT': () => Promise.resolve({ default: ConfirmMissingAltTextModal }),
  'MUTE': MuteModal,
  'BLOCK': BlockModal,
  'DOMAIN_BLOCK': DomainBlockModal,
  'REPORT': ReportModal,
  'ACTIONS': () => Promise.resolve({ default: ActionsModal }),
  'EMBED': EmbedModal,
  'FOCAL_POINT': () => Promise.resolve({ default: AltTextModal }),
  'LIST_ADDER': ListAdder,
  'COMPARE_HISTORY': CompareHistoryModal,
  'FILTER': FilterModal,
  'SUBSCRIBED_LANGUAGES': SubscribedLanguagesModal,
  'INTERACTION': InteractionModal,
  'CLOSED_REGISTRATIONS': ClosedRegistrationsModal,
  'IGNORE_NOTIFICATIONS': IgnoreNotificationsModal,
  'ANNUAL_REPORT': AnnualReportModal,
  'SCHEDULE': ScheduleModal,
  // @_longwhile — DM 채팅. 새 대화의 수신자 선택과 방의 멤버 관리.
  'DM_RECIPIENT': DmRecipientModal,
  'DM_MEMBERS': DmMemberModal,
  // @_longwhile — 답글이 부를 사람 고르기.
  'REPLY_RECIPIENTS': ReplyRecipientsModal,
};

// Modals that must not lock the page scroll. Locking swaps `overflow-y: hidden`
// onto the body, which means the page behind stops responding to the wheel.
// The account switcher avoids this by rendering its own portal; these opt out
// instead.
//
// @_longwhile — 이 주석은 "마진으로 보정하는데 그것이 화면을 덜컹이게 한다" 고
//   적고 있었다. 그 보정은 아래 componentDidUpdate 에서 뺐으므로 더는 사실이
//   아니다. 잠금이 남기는 차이는 **뒤쪽 화면이 스크롤되지 않는다** 는 것뿐이다.
const SCROLL_UNLOCKED_MODALS = ['SCHEDULE'];

export default class ModalRoot extends PureComponent {

  static propTypes = {
    type: PropTypes.string,
    props: PropTypes.object,
    onClose: PropTypes.func.isRequired,
    ignoreFocus: PropTypes.bool,
  };

  state = {
    backgroundColor: null,
  };

  getSnapshotBeforeUpdate () {
    return { visible: !!this.props.type && !SCROLL_UNLOCKED_MODALS.includes(this.props.type) };
  }

  // @_longwhile — 스크롤바 폭만큼 `html` 에 marginRight 를 주던 상류 보정을 뺐다.
  //
  //   상류의 전제는 "모달이 열리면 body 가 `overflow-y: hidden` 이 되어 스크롤바
  //   자리가 사라지고, 그만큼 화면이 오른쪽으로 넓어진다" 는 것이다. 그래서 같은
  //   폭의 마진으로 되민다.
  //
  //   **그 전제가 이 저장소에서는 더 이상 참이 아니다.** `basics.scss` 가 `html`
  //   에 `scrollbar-gutter: stable` 을 걸어 자리를 늘 잡아 두므로, 잠금만으로는
  //   폭이 변하지 않는다. 거기에 마진까지 더하면 **없어지지 않은 스크롤바를 한 번
  //   더 보정해** 화면이 그 폭만큼 밀린다.
  //
  //   실측(1369px 창, 스크롤바 8px):
  //     평소                     body.clientWidth 1363
  //     잠금만                                    1363   ← 보정이 필요 없다
  //     잠금 + marginRight 8px                    1355   ← 여기서 덜컹한다
  //
  //   삭제 확인 모달에서만 눈에 띈 이유는 그것이 잠그는 모달이기 때문이다.
  //   예약(SCHEDULE)은 아래 SCROLL_UNLOCKED_MODALS 로 잠금을 건너뛰고, 계정
  //   전환은 자체 포털을 쓴다. 둘 다 이 경로를 타지 않는다.
  //
  //   스크롤바가 오버레이인 환경(macOS·iOS)에서는 getScrollbarWidth() 가 0 이라
  //   원래도 보정이 없었다. 고전 스크롤바를 쓰는 환경(Windows·Linux)은
  //   `scrollbar-gutter` 를 지원하는 브라우저와 겹치므로, 빼도 되돌아가지 않는다.
  componentDidUpdate (prevProps, prevState, { visible }) {
    if (visible) {
      document.body.classList.add('with-modals--active');
    } else {
      document.body.classList.remove('with-modals--active');
    }
  }

  setBackgroundColor = color => {
    this.setState({ backgroundColor: color });
  };

  renderLoading = () => {
    const { onClose } = this.props;

    return <ModalPlaceholder loading onClose={onClose} />;
  };

  renderError = (props) => {
    const { onClose } = this.props;

    return <ModalPlaceholder {...props} onClose={onClose} />;
  };

  handleClose = (ignoreFocus = false) => {
    const { onClose } = this.props;
    const message = this._modal?.getCloseConfirmationMessage?.();
    onClose(message, ignoreFocus);
  };

  setModalRef = (c) => {
    this._modal = c;
  };

  render () {
    const { type, props, ignoreFocus } = this.props;
    const { backgroundColor } = this.state;
    const visible = !!type;

    return (
      <Base backgroundColor={backgroundColor} onClose={this.handleClose} ignoreFocus={ignoreFocus}>
        {visible && (
          <>
            <BundleContainer fetchComponent={MODAL_COMPONENTS[type]} loading={this.renderLoading} error={this.renderError} renderDelay={200}>
              {(SpecificComponent) => {
                return <SpecificComponent {...props} onChangeBackgroundColor={this.setBackgroundColor} onClose={this.handleClose} ref={this.setModalRef} />;
              }}
            </BundleContainer>

            <Helmet>
              <meta name='robots' content='noindex' />
            </Helmet>
          </>
        )}
      </Base>
    );
  }

}
