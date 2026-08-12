// @_longwhile custom feature

import { useCallback, useEffect, useRef, useState } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import { showAlert, showAlertForError } from 'mastodon/actions/alerts';
import api from 'mastodon/api';
import type { ApiMediaAttachmentJSON } from 'mastodon/api_types/media_attachments';
import { useAppDispatch } from 'mastodon/store';

const messages = defineMessages({
  tooMany: {
    id: 'messages.upload.too_many',
    defaultMessage: 'You can attach up to {limit} files. The rest were dropped.',
  },
  videoAlone: {
    id: 'messages.upload.video_alone',
    defaultMessage: 'A video or audio file has to be sent on its own.',
  },
});

export type UploadState = 'uploading' | 'processing' | 'done' | 'failed';

export interface Upload {
  localId: string;

  name: string;

  previewUrl?: string;

  mediaId?: string;
  state: UploadState;

  exclusive: boolean;
}

const MAX_POLLS = 30;
const MAX_BACKOFF_MS = 8000;

const isImage = (file: File) => file.type.startsWith('image/');

const isExclusive = (file: File) =>
  file.type.startsWith('video/') || file.type.startsWith('audio/');

export const useUploads = (limit: number) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();

  const [uploads, setUploads] = useState<Upload[]>([]);

  const mountedRef = useRef(true);
  const counterRef = useRef(0);

  const uploadsRef = useRef<Upload[]>([]);

  useEffect(() => {
    uploadsRef.current = uploads;
  }, [uploads]);

  const urlsRef = useRef(new Set<string>());

  const releaseUrl = useCallback((url?: string) => {
    if (!url) return;

    URL.revokeObjectURL(url);
    urlsRef.current.delete(url);
  }, []);

  useEffect(
    () => () => {
      mountedRef.current = false;
      urlsRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      urlsRef.current.clear();
    },
    [],
  );

  const update = useCallback((localId: string, patch: Partial<Upload>) => {
    if (!mountedRef.current) return;

    setUploads((current) =>
      current.map((upload) =>
        upload.localId === localId ? { ...upload, ...patch } : upload,
      ),
    );
  }, []);

  const poll = useCallback(
    (localId: string, mediaId: string, tryCount: number) => {
      if (!mountedRef.current) return;

      if (tryCount > MAX_POLLS) {
        update(localId, { state: 'failed' });
        return;
      }

      void api()
        .get(`/api/v1/media/${mediaId}`)
        .then((response) => {
          if (response.status === 200) {
            update(localId, { state: 'done', mediaId });
          } else {
            const retryAfter = Math.min(
              (Math.log2(tryCount) || 1) * 1000,
              MAX_BACKOFF_MS,
            );

            setTimeout(() => {
              poll(localId, mediaId, tryCount + 1);
            }, retryAfter);
          }

          return response;
        })
        .catch(() => {
          update(localId, { state: 'failed' });
        });
    },
    [update],
  );

  const upload = useCallback(
    (file: File) => {
      counterRef.current += 1;

      const localId = `dm-upload-${counterRef.current}`;
      let previewUrl: string | undefined;

      if (isImage(file)) {
        previewUrl = URL.createObjectURL(file);
        urlsRef.current.add(previewUrl);
      }

      const data = new FormData();
      data.append('file', file);

      void api()
        .post<ApiMediaAttachmentJSON>('/api/v2/media', data)
        .then((response) => {
          if (response.status === 200) {
            update(localId, { state: 'done', mediaId: response.data.id });
          } else {
            update(localId, {
              state: 'processing',
              mediaId: response.data.id,
            });
            poll(localId, response.data.id, 1);
          }

          return response;
        })
        .catch((error: unknown) => {
          update(localId, { state: 'failed' });

          dispatch(showAlertForError(error));
        });

      return {
        localId,
        name: file.name,
        previewUrl,
        state: 'uploading' as const,
        exclusive: isExclusive(file),
      };
    },
    [dispatch, poll, update],
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const incoming = Array.from(files);

      if (incoming.length === 0) return;

      const current = uploadsRef.current;

      const blockedByExclusive =
        current.some((entry) => entry.exclusive) ||
        (incoming.some(isExclusive) && (current.length > 0 || incoming.length > 1));

      if (blockedByExclusive) {
        dispatch(showAlert({ message: intl.formatMessage(messages.videoAlone) }));
        return;
      }

      const room = Math.max(0, limit - current.length);
      const accepted = incoming.slice(0, room);

      if (accepted.length < incoming.length) {
        dispatch(
          showAlert({ message: intl.formatMessage(messages.tooMany, { limit }) }),
        );
      }

      if (accepted.length === 0) return;

      const created = accepted.map(upload);

      uploadsRef.current = [...current, ...created];

      setUploads((existing) => [...existing, ...created]);
    },
    [dispatch, intl, limit, upload],
  );

  const remove = useCallback(
    (localId: string) => {
      setUploads((current) => {
        const target = current.find((entry) => entry.localId === localId);

        releaseUrl(target?.previewUrl);

        return current.filter((entry) => entry.localId !== localId);
      });
    },
    [releaseUrl],
  );

  const reset = useCallback(() => {
    setUploads((current) => {
      current.forEach((entry) => {
        releaseUrl(entry.previewUrl);
      });

      return [];
    });
  }, [releaseUrl]);

  const mediaIds = uploads.flatMap((entry) =>
    entry.state === 'done' && entry.mediaId ? [entry.mediaId] : [],
  );

  const isBusy = uploads.some(
    (entry) => entry.state === 'uploading' || entry.state === 'processing',
  );

  return {
    uploads,
    mediaIds,
    isBusy,
    canAddMore:
      uploads.length < limit && !uploads.some((entry) => entry.exclusive),
    addFiles,
    remove,
    reset,
  };
};
