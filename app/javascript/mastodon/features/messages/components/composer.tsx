// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅

import { useCallback, useEffect, useRef, useState } from 'react';

import { defineMessages, useIntl } from 'react-intl';

// 상류 아이콘이 아니라 우리가 넣은 종이비행기다.
//   원본은 IconPark 계열 export 라 `fill="none"` 인 24×24 사각형 더미 path 가
//   함께 들어 있었다. `.icon path { fill: currentColor }`(components.scss)가
//   전역이라 그 더미까지 칠해 **화살표 대신 꽉 찬 사각형**이 나온다. 더미를
//   지우고 `viewBox` 를 넣어 두었다.
//
//   `styles/bird-theme-svg/` 가 아니라 `images/` 에 둔다. 저쪽은 테마가
//   `mask-image: url(...)` 로 쓰는 CSS 자산 자리라, 거기 둔 파일을 JS 가
//   import 하면 테마를 정리하는 사람이 지웠을 때 **빌드가 깨진다.**
// 첨부. 테마(bird-ui / theme-ui)가 `mask-image` 로 쓰는 원본이
// `styles/bird-theme-svg/compose-form-photo.svg` 에 있고, 그것을 옮기면 테마가
// 깨지므로 **여기 사본을 둔다.** 둘을 함께 고쳐야 한다.
//   이 아이콘은 `fill` 이 아니라 **stroke** 로 그린다. 전역 규칙
//   `.icon path { fill: currentColor }` 가 그대로 걸리면 선이 아니라 덩어리가
//   되므로, components.scss 의 `__attach .icon path` 에서 되돌린다.
import AttachmentIcon from '@/images/compose-form-photo.svg?react';
import SendIcon from '@/images/send-fill.svg?react';
import EditIcon from '@/styles/bird-theme-svg/pencil-fill.svg?react';
import { Icon } from 'mastodon/components/icon';
import type { TypographicReplacement } from 'mastodon/utils/typographic_replacements';
import {
  applyEditToTextarea,
  replaceTypedSequence,
  undoTypographicReplacement,
} from 'mastodon/utils/typographic_replacements';

import { useSendOnEnter } from '../util/use_send_on_enter';
import type { Upload } from '../util/use_uploads';

const messages = defineMessages({
  placeholder: {
    id: 'messages.composer.placeholder',
    defaultMessage: 'Write a message…',
  },
  save: {
    id: 'messages.composer.save',
    defaultMessage: 'Save',
  },
  send: { id: 'messages.composer.send', defaultMessage: 'Send' },
  attach: { id: 'messages.composer.attach', defaultMessage: 'Add media' },
  removeAttachment: {
    id: 'messages.composer.remove_attachment',
    defaultMessage: 'Remove attachment',
  },
  uploading: {
    id: 'messages.composer.uploading',
    defaultMessage: 'Uploading…',
  },
  uploadFailed: {
    id: 'messages.composer.upload_failed',
    defaultMessage: 'Upload failed',
  },
  remaining: {
    id: 'messages.composer.remaining',
    defaultMessage: '{count} characters left',
  },
  attachmentFull: {
    id: 'messages.composer.attachment_full',
    defaultMessage: 'Attachment limit reached',
  },
  removeNamed: {
    id: 'messages.composer.remove_named_attachment',
    defaultMessage: 'Remove {name}',
  },
});

// 우리 인스턴스의 글자 수 제한. 상류 기본값 500 이 아니다.
// (app/validators/status_length_validator.rb)
const MAX_CHARACTERS = 1000;

// 남은 글자가 이보다 적어질 때만 카운터를 띄운다. 채팅 메시지는 대부분 짧아서
// 평소에 늘 띄워두면 잡음이다.
const COUNTER_THRESHOLD = 100;

const MAX_ROWS = 6;

const UploadItem: React.FC<{
  upload: Upload;
  onRemove?: (localId: string) => void;
}> = ({ upload, onRemove }) => {
  const intl = useIntl();

  const handleRemove = useCallback(() => {
    onRemove?.(upload.localId);
  }, [onRemove, upload.localId]);

  return (
    <li
      className={
        upload.state === 'failed'
          ? 'dm-composer__upload dm-composer__upload--failed'
          : 'dm-composer__upload'
      }
    >
      {/* 미리보기 이미지는 장식이다(alt=''). 파일 이름은 아래에서 항상 낸다 —
          이미지일 때만 이름을 빼면 스크린 리더에는 "첨부 지우기 단추" 만 줄줄이
          남아 몇 장인지도, 어느 것인지도 알 수 없다. */}
      {upload.previewUrl ? (
        <>
          <img src={upload.previewUrl} alt='' />
          <span className='dm-composer__upload__name dm-composer__upload__name--sr'>
            {upload.name}
          </span>
        </>
      ) : (
        <span className='dm-composer__upload__name'>{upload.name}</span>
      )}

      {upload.state !== 'done' && (
        // 상태 변화를 소리로도 알린다. uploading → failed 가 무음이면 실패를
        // 영영 모른 채 전송 버튼이 왜 안 눌리는지만 궁금해진다.
        <span className='dm-composer__upload__state' role='status'>
          {intl.formatMessage(
            upload.state === 'failed'
              ? messages.uploadFailed
              : messages.uploading,
          )}
        </span>
      )}

      <button
        type='button'
        className='dm-composer__upload__remove'
        title={intl.formatMessage(messages.removeAttachment)}
        aria-label={intl.formatMessage(messages.removeNamed, {
          name: upload.name,
        })}
        onClick={handleRemove}
      >
        ×
      </button>
    </li>
  );
};

interface Props {
  disabled?: boolean;
  disabledReason?: string;

  // 전송 시 본문 앞에 붙는 수신자 핸들의 길이. 서버는 그것까지 세므로 카운터도
  // 같이 세야 "보낼 수 있다" 고 해놓고 422 가 나는 일이 없다.
  reservedCharacters?: number;

  // 첨부. 올리는 중이거나 서버가 처리 중인 것이 하나라도 있으면 보낼 수 없다 —
  // 아직 준비되지 않은 media_id 를 보내면 서버가 422 로 거절한다.
  uploads?: Upload[];
  canAttach?: boolean;
  isUploading?: boolean;

  // 전송 응답을 기다리는 중. 버튼만 잠근다 — textarea 를 disabled 로 바꾸면
  // 포커스가 빠져나가고 다시 켜도 돌아오지 않는다.
  isSending?: boolean;

  // 메시지를 고치는 중인가. 버튼이 하는 일이 "보내기" 가 아니라 "저장" 이라,
  // 종이비행기를 그대로 두면 새 메시지가 나가는 줄 알게 된다. (room.tsx 의 editing)
  isEditing?: boolean;
  onAttach?: (files: FileList) => void;
  onRemoveAttachment?: (localId: string) => void;

  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export const Composer: React.FC<Props> = ({
  disabled = false,
  disabledReason,
  reservedCharacters = 0,
  uploads = [],
  canAttach = false,
  isUploading = false,
  isSending = false,
  isEditing = false,
  onAttach,
  onRemoveAttachment,
  value,
  onChange,
  onSubmit,
}) => {
  const intl = useIntl();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const typographic = useRef<TypographicReplacement | null>(null);

  // 조합 중인지. IME 이벤트만으로는 브라우저마다 시점이 달라 keydown 쪽 가드와
  // 함께 쓴다.
  const [isComposing, setIsComposing] = useState(false);

  // 이 화면에서 Enter 가 전송인지 줄바꿈인지. 3열이 성립하는 폭에서만 전송이다.
  const sendOnEnter = useSendOnEnter();

  const remaining = MAX_CHARACTERS - reservedCharacters - value.length;
  const tooLong   = remaining < 0;

  // 첨부만 보내는 것도 메시지다. 본문이 비어 있어도 올라간 첨부가 있으면 보낼 수
  // 있어야 한다. 반대로 올리는 중인 것이 있으면 본문이 있어도 막는다.
  const hasReadyMedia = uploads.some((upload) => upload.state === 'done');

  // 보낼 것이 있는가. 전송 버튼은 이것과 무관하게 늘 그려지고, 이 값은 버튼을
  // **누를 수 있는지**(canSubmit)에만 들어간다.
  const hasContent = value.trim() !== '' || hasReadyMedia;

  const canSubmit =
    !disabled && !tooLong && !isUploading && !isSending && hasContent;

  // 1줄에서 시작해 최대 6줄까지 늘어나고, 그 뒤로는 안에서 스크롤한다.
  useEffect(() => {
    const node = textarea.current;
    if (!node) return;

    node.style.height = 'auto';

    // scrollHeight 는 상하 padding 을 포함한다. 그것을 더하지 않으면 최대 높이가
    // 6줄에서 padding 만큼 모자라, 마지막 줄이 반쯤 잘린 채 스크롤이 시작된다.
    const style = getComputedStyle(node);
    const lineHeight = parseFloat(style.lineHeight || '24');
    const verticalPadding =
      parseFloat(style.paddingTop || '0') + parseFloat(style.paddingBottom || '0');
    const maxHeight = lineHeight * MAX_ROWS + verticalPadding;

    node.style.height    = `${Math.min(node.scrollHeight, maxHeight)}px`;
    node.style.overflowY = node.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [value]);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const { target } = event;
      // 조합 중인 글자를 건드리면 IME 가 꼬인다.
      const composing =
        isComposing || (event.nativeEvent as Partial<InputEvent>).isComposing === true;
      const edit = composing
        ? null
        : replaceTypedSequence(
            value,
            target.value,
            target.selectionStart,
            typographic.current,
          );

      typographic.current = edit?.replacement ?? null;
      if (edit) applyEditToTextarea(target, edit);

      onChange(target.value);
    },
    [value, isComposing, onChange],
  );

  // 자동으로 바뀐 기호 바로 뒤의 Backspace 는 친 그대로 되돌린다.
  const undoTypographic = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      const target = event.currentTarget;
      const edit = undoTypographicReplacement(
        target.value,
        target.selectionStart,
        target.selectionEnd,
        typographic.current,
      );

      typographic.current = null;
      if (!edit) return false;

      event.preventDefault();
      applyEditToTextarea(target, edit);
      onChange(target.value);
      return true;
    },
    [onChange],
  );

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    onSubmit();
  }, [canSubmit, onSubmit]);

  // 전송 키는 화면에 따라 갈린다. (OI-09 해소, DECISIONS A-17)
  //
  //   PC 뷰        Enter = 전송,  Shift+Enter = 줄바꿈
  //   모바일·탭    Enter = 줄바꿈, Ctrl/⌘+Enter = 전송
  //
  // 좁은 화면에서 Enter 를 전송으로 두면 줄을 바꿀 방법이 사실상 없다(기획서
  // 4.4.2). 넓은 화면에서는 반대로 Enter 전송이 채팅의 기본 기대다.
  //
  // **조합 가드가 이 분기의 전제다.** 한글은 조합 입력이라, "안녕하세요" 를 치고
  // 누른 첫 Enter 는 조합을 확정하는 키인데 브라우저·IME 조합에 따라 그 키가
  // 전송까지 일으킨다. 마지막 글자가 빠지거나("안녕하세" 전송), 같은 메시지가 두
  // 번 나가거나, 조합 중이던 글자가 다음 메시지 앞에 붙는다.
  //
  // 기존 툿 작성창이 같은 처리를 한다
  // (app/javascript/mastodon/components/autosuggest_textarea.jsx).
  // which === 229 와 isComposing 을 함께 보는 이유는 조합 중 키 이벤트의 표현이
  // 브라우저마다 다르기 때문이다. 일본어·중국어 입력기도 같은 문제를 겪는다.
  //
  // 근거: dm-chat-phase-2.md §7.2, 검토 Q-1 (이 프로젝트 최우선 검증 항목)
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // `which` 는 폐기 예정이지만 조합 중 keydown 에서 229 를 주는 유일한 신호인
      // 브라우저가 아직 있다. 기존 툿 작성창도 같은 이유로 함께 본다.
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const legacyImeKeyCode = event.which === 229;

      if (legacyImeKeyCode || event.nativeEvent.isComposing || isComposing) {
        return;
      }

      if (event.key === 'Backspace') {
        undoTypographic(event);
        return;
      }

      if (event.key === 'Enter') {
        // Ctrl/⌘+Enter 는 어느 화면에서나 전송이다. 좁은 화면의 물리 키보드
        // 사용자에게 필요하고, 넓은 화면에서는 기존 툿 작성창과 같은 조합이라
        // 손에 익어 있다.
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          handleSubmit();
          return;
        }

        // Shift+Enter 는 PC 뷰의 줄바꿈이다. 좁은 화면에서는 Enter 자체가
        // 줄바꿈이므로 둘 다 그냥 통과시킨다.
        if (sendOnEnter && !event.shiftKey) {
          event.preventDefault();
          handleSubmit();
        }

        return;
      }

      // 답장 취소는 Esc 로도 되어야 한다. 마우스로 × 를 찾아 누르게 하면 답장을
      // 걸어둔 채 그냥 보내 버리는 쪽이 빠르다.
    },
    [handleSubmit, isComposing, sendOnEnter, undoTypographic],
  );

  const handleAttachClick = useCallback(() => {
    fileInput.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const { files } = event.target;

      if (files && files.length > 0) onAttach?.(files);

      // 값을 비워야 같은 파일을 지웠다가 다시 고를 때 change 가 다시 난다.
      event.target.value = '';
    },
    [onAttach],
  );

  const handleCompositionStart = useCallback(() => {
    setIsComposing(true);
  }, []);

  const handleCompositionEnd = useCallback(() => {
    setIsComposing(false);
  }, []);

  // 조합 중에 포커스가 빠지면 compositionend 가 안 오는 브라우저가 있다. 그때
  // isComposing 이 true 로 굳으면 Enter 전송과 Esc 취소가 **둘 다** 죽는다.
  const handleBlur = useCallback(() => {
    typographic.current = null;
    setIsComposing(false);
  }, []);

  return (
    <div className='dm-composer'>
      {disabledReason && (
        <p className='dm-composer__notice'>{disabledReason}</p>
      )}

      {uploads.length > 0 && (
        <ul className='dm-composer__uploads'>
          {uploads.map((upload) => (
            <UploadItem
              key={upload.localId}
              upload={upload}
              onRemove={onRemoveAttachment}
            />
          ))}
        </ul>
      )}

      <div className='dm-composer__row'>
        {onAttach && (
          <>
            <input
              ref={fileInput}
              type='file'
              className='dm-composer__file-input'
              multiple
              accept='image/*,video/*,audio/*'
              onChange={handleFileChange}
            />

            <button
              type='button'
              className='dm-composer__attach'
              disabled={disabled || !canAttach}
              title={intl.formatMessage(
                canAttach ? messages.attach : messages.attachmentFull,
              )}
              aria-label={intl.formatMessage(
                canAttach ? messages.attach : messages.attachmentFull,
              )}
              onClick={handleAttachClick}
            >
              <Icon id='paperclip' icon={AttachmentIcon} />
            </button>
          </>
        )}

        {/* **모서리와 테두리는 이 상자(field)가 맡고, textarea 는 그 안에서 글자만
            그린다.** textarea 자체에 테두리와 모서리를 주면 한 줄일 때와 여러 줄일
            때 모서리가 따로 논다.

            상자 안에는 글자 수 카운터만 둔다. 첨부와 전송은 **상자 밖** 좌우다. */}
        <div className='dm-composer__field'>
          <textarea
            ref={textarea}
            className='dm-composer__textarea'
            value={value}
            rows={1}
            disabled={disabled}
            placeholder={intl.formatMessage(messages.placeholder)}
            aria-label={intl.formatMessage(messages.placeholder)}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
          />

          {remaining <= COUNTER_THRESHOLD && (
            <span
              className={
                tooLong
                  ? 'dm-composer__counter dm-composer__counter--over'
                  : 'dm-composer__counter'
              }
              // 숫자만 있으면 스크린 리더가 "-5" 라고만 읽는다. 무엇의 5 인지 붙인다.
              aria-label={intl.formatMessage(messages.remaining, { count: remaining })}
              // 글자 수가 한계에 닿는 것은 **보고 있지 않으면 모를 변화**다.
              // 없으면 전송이 왜 막혔는지 알 방법이 없다. 바로 위 업로드 상태도
              // 같은 이유로 role='status' 를 쓴다.
              role='status'
            >
              {remaining}
            </span>
          )}
        </div>

        {/* **늘 그린다.** 보낼 것이 있을 때만 그리면, 상자 밖에 있는 이 버튼이
            나타나고 사라질 때마다 줄 전체가 다시 배치되어 첫 글자를 치는 순간
            입력창이 32px 줄어든다. 눌러도 되는지는 disabled 가 가른다. */}
        <button
          type='button'
          className='dm-composer__send'
          disabled={!canSubmit}
          title={intl.formatMessage(isEditing ? messages.save : messages.send)}
          aria-label={intl.formatMessage(
            isEditing ? messages.save : messages.send,
          )}
          onClick={handleSubmit}
        >
          <Icon
            id={isEditing ? 'pencil' : 'send'}
            icon={isEditing ? EditIcon : SendIcon}
          />
        </button>
      </div>
    </div>
  );
};
