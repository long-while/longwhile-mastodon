// @_longwhile custom feature

import { useCallback, useEffect, useRef, useState } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import AttachmentIcon from '@/images/compose-form-photo.svg?react';
import SendIcon from '@/images/send-fill.svg?react';
import EditIcon from '@/styles/bird-theme-svg/pencil-fill.svg?react';
import { Icon } from 'mastodon/components/icon';

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

const MAX_CHARACTERS = 1000;

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

  reservedCharacters?: number;

  uploads?: Upload[];
  canAttach?: boolean;
  isUploading?: boolean;

  isSending?: boolean;

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

  const [isComposing, setIsComposing] = useState(false);

  const sendOnEnter = useSendOnEnter();

  const remaining = MAX_CHARACTERS - reservedCharacters - value.length;
  const tooLong   = remaining < 0;

  const hasReadyMedia = uploads.some((upload) => upload.state === 'done');

  const hasContent = value.trim() !== '' || hasReadyMedia;

  const canSubmit =
    !disabled && !tooLong && !isUploading && !isSending && hasContent;

  useEffect(() => {
    const node = textarea.current;
    if (!node) return;

    node.style.height = 'auto';

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
      onChange(event.target.value);
    },
    [onChange],
  );

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    onSubmit();
  }, [canSubmit, onSubmit]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const legacyImeKeyCode = event.which === 229;

      if (legacyImeKeyCode || event.nativeEvent.isComposing || isComposing) {
        return;
      }

      if (event.key === 'Enter') {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          handleSubmit();
          return;
        }

        if (sendOnEnter && !event.shiftKey) {
          event.preventDefault();
          handleSubmit();
        }

        return;
      }

    },
    [handleSubmit, isComposing, sendOnEnter],
  );

  const handleAttachClick = useCallback(() => {
    fileInput.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const { files } = event.target;

      if (files && files.length > 0) onAttach?.(files);

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

  const handleBlur = useCallback(() => {
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
              aria-label={intl.formatMessage(messages.remaining, { count: remaining })}
              role='status'
            >
              {remaining}
            </span>
          )}
        </div>

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
