import PropTypes from 'prop-types';
import { PureComponent } from 'react';

import { defineMessages, injectIntl, FormattedMessage } from 'react-intl';

import { is } from 'immutable';
import ImmutablePureComponent from 'react-immutable-pure-component';

import Textarea from 'react-textarea-autosize';

const messages = defineMessages({
  placeholder: { id: 'account_note.placeholder', defaultMessage: 'Click to add a note' },
});

class InlineAlert extends PureComponent {

  static propTypes = {
    show: PropTypes.bool,
  };

  state = {
    mountMessage: false,
  };

  static TRANSITION_DELAY = 200;

  UNSAFE_componentWillReceiveProps (nextProps) {
    if (!this.props.show && nextProps.show) {
      this.setState({ mountMessage: true });
    } else if (this.props.show && !nextProps.show) {
      setTimeout(() => this.setState({ mountMessage: false }), InlineAlert.TRANSITION_DELAY);
    }
  }

  render () {
    const { show } = this.props;
    const { mountMessage } = this.state;

    return (
      <span aria-live='polite' role='status' className='inline-alert' style={{ opacity: show ? 1 : 0 }}>
        {mountMessage && <FormattedMessage id='generic.saved' defaultMessage='Saved' />}
      </span>
    );
  }

}

class AccountNote extends ImmutablePureComponent {

  static propTypes = {
    accountId: PropTypes.string.isRequired,
    value: PropTypes.string,
    onSave: PropTypes.func.isRequired,
    intl: PropTypes.object.isRequired,
  };

  state = {
    value: null,
    saving: false,
    saved: false,
  };

  UNSAFE_componentWillMount () {
    this._reset();
  }

  UNSAFE_componentWillReceiveProps (nextProps) {
    const accountWillChange = !is(this.props.accountId, nextProps.accountId);
    const newState = {};

    if (accountWillChange && this._isDirty()) {
      this._save(false);
    }

    if (accountWillChange || nextProps.value === this.state.value) {
      newState.saving = false;
    }

    if (this.props.value !== nextProps.value) {
      newState.value = nextProps.value;
    }

    this.setState(newState);
  }

  componentWillUnmount () {
    if (this._isDirty()) {
      this._save(false);
    }
  }

  setTextareaRef = c => {
    this.textarea = c;
  };

  handleChange = e => {
    this.setState({ value: e.target.value, saving: false });
  };

  handleKeyDown = e => {
    if (e.keyCode === 13 && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();

      if (this.textarea) {
        this.textarea.blur();
      } else {
        this._save();
      }
    } else if (e.keyCode === 27) {
      e.preventDefault();

      this._reset(() => {
        if (this.textarea) {
          this.textarea.blur();
        }
      });
    }
  };

  handleBlur = () => {
    if (this._isDirty()) {
      this._save();
    }
  };

  _save (showMessage = true) {
    this.setState({ saving: true }, () => this.props.onSave(this.state.value));

    if (showMessage) {
      this.setState({ saved: true }, () => setTimeout(() => this.setState({ saved: false }), 2000));
    }
  }

  _reset (callback) {
    this.setState({ value: this.props.value }, callback);
  }

  _isDirty () {
    return !this.state.saving && this.props.value !== null && this.state.value !== null && this.state.value !== this.props.value;
  }

  render () {
    const { accountId, intl } = this.props;
    const { value, saved } = this.state;

    if (!accountId) {
      return null;
    }

    return (
      <div className='account__header__account-note'>
        {/* @_longwhile — 보이는 "개인 메모" 라벨을 없앴다(2026-08-13 요청).
            입력창의 플레이스홀더("클릭하여 노트 추가")가 같은 말을 하고 있어
            제목이 한 번 더 있을 이유가 없다.

            **두 가지를 라벨이 대신하고 있었으므로 그것만 남긴다.**

              이름  라벨이 사라지면 입력창에 이름이 없어져 스크린 리더가
                    "편집" 이라고만 읽는다. `aria-label` 로 옮긴다.
                    플레이스홀더는 이름이 아니다 — 글자를 넣으면 사라진다.
              저장  이 메모는 포커스를 잃을 때 저장되고, 그 알림이 라벨 안에
                    있었다. 화면에서는 사라지지만 낭독은 남긴다. */}
        <span className='account__header__account-note__status'>
          <InlineAlert show={saved} />
        </span>

        <Textarea
          id={`account-note-${accountId}`}
          className='account__header__account-note__content'
          aria-label={intl.formatMessage(messages.placeholder)}
          disabled={this.props.value === null || value === null}
          placeholder={intl.formatMessage(messages.placeholder)}
          value={value || ''}
          onChange={this.handleChange}
          onKeyDown={this.handleKeyDown}
          onBlur={this.handleBlur}
          ref={this.setTextareaRef}
        />
      </div>
    );
  }

}

export default injectIntl(AccountNote);
