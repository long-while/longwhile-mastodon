// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   입력창의 첨부 업로드.
//
//   기존 compose 의 업로드 상태(`compose.media_attachments`)를 빌려 쓰지 않는다.
//   그 상태는 툿 작성창 하나를 위한 것이라, 방을 옮기거나 툿 작성창을 함께 열면
//   서로의 첨부를 덮어쓴다. 방마다 독립적이어야 하므로 여기서 따로 든다.
//
//   **202 폴링이 이 파일의 핵심이다.** 서버는 큰 이미지나 동영상을 비동기로
//   처리하고 202 를 준다. 그 상태의 id 를 그대로 media_ids 에 넣어 보내면 서버가
//   422 로 거절한다. 처리가 끝날 때까지 기다렸다가 보낼 수 있게 한다.
//   (app/javascript/mastodon/actions/compose.js 의 uploadCompose 와 같은 절차)

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
  // 서버가 강제하는 규칙이다 (PostStatusService 의 images_and_video 검증).
  // 여기서 막지 않으면 업로드는 다 성공해 놓고 전송만 422 로 떨어진다.
  videoAlone: {
    id: 'messages.upload.video_alone',
    defaultMessage: 'A video or audio file has to be sent on its own.',
  },
});

export type UploadState = 'uploading' | 'processing' | 'done' | 'failed';

export interface Upload {
  // 화면용 임시 키. 서버 id 는 업로드가 끝나야 생긴다.
  localId: string;

  name: string;

  // 이미지 미리보기용 objectURL. 이미지가 아니면 없다.
  previewUrl?: string;

  mediaId?: string;
  state: UploadState;

  // 동영상·소리는 혼자만 보낼 수 있다. 개수 판정에 쓴다.
  exclusive: boolean;
}

// 처리 대기 폴링의 상한. 무한히 두면 서버가 영영 안 끝내는 파일 하나 때문에
// 입력창이 계속 잠긴다. 동영상 트랜스코딩을 감당해야 하므로 넉넉히 둔다 —
// 백오프를 합치면 대략 3분이다.
const MAX_POLLS = 30;
const MAX_BACKOFF_MS = 8000;

const isImage = (file: File) => file.type.startsWith('image/');

const isExclusive = (file: File) =>
  file.type.startsWith('video/') || file.type.startsWith('audio/');

export const useUploads = (limit: number) => {
  const intl = useIntl();
  const dispatch = useAppDispatch();

  const [uploads, setUploads] = useState<Upload[]>([]);

  // 언마운트 후에 도착한 응답이 setState 를 부르지 않게 한다. 방을 옮기는 동안
  // 업로드가 끝나는 것은 흔한 일이다.
  const mountedRef = useRef(true);
  const counterRef = useRef(0);

  // addFiles 가 setState 업데이터 **밖에서** 현재 개수를 알아야 한다. 업데이터
  // 안에서 네트워크 요청을 내면 React 가 그것을 다시 호출할 권리가 있어(엄격
  // 모드·트랜지션) 같은 파일이 두 번 올라간다.
  const uploadsRef = useRef<Upload[]>([]);

  useEffect(() => {
    uploadsRef.current = uploads;
  }, [uploads]);

  // objectURL 은 명시적으로 풀어줘야 한다. 방을 오래 열어두고 사진을 여러 장
  // 붙였다 떼면 그만큼 메모리가 잡힌 채로 남는다.
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
            // 206 = 아직 처리 중. 상류와 같은 지수 백오프를 쓰되 상한을 둔다.
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
            // 202 — 서버가 아직 처리 중이다. 끝날 때까지 보낼 수 없다.
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

          // 서버가 알려준 이유(용량 초과·형식 불가)를 그대로 보여준다. 작은
          // "올리지 못했습니다" 만으로는 파일을 줄여야 하는지 바꿔야 하는지 모른다.
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

      // 동영상·소리가 이미 붙어 있거나 새로 들어오면, 그 하나만 보낼 수 있다.
      const blockedByExclusive =
        current.some((entry) => entry.exclusive) ||
        (incoming.some(isExclusive) && (current.length > 0 || incoming.length > 1));

      if (blockedByExclusive) {
        dispatch(showAlert({ message: intl.formatMessage(messages.videoAlone) }));
        return;
      }

      const room = Math.max(0, limit - current.length);
      const accepted = incoming.slice(0, room);

      // 넘친 것을 조용히 버리지 않는다. 고른 만큼 붙었다고 믿고 보내면 사용자는
      // 빠진 사진을 나중에야 안다.
      if (accepted.length < incoming.length) {
        dispatch(
          showAlert({ message: intl.formatMessage(messages.tooMany, { limit }) }),
        );
      }

      if (accepted.length === 0) return;

      const created = accepted.map(upload);

      // ref 를 여기서 바로 맞춘다. 이펙트가 도는 것을 기다리면, 같은 틱에
      // addFiles 가 두 번 불릴 때(드래그앤드롭·붙여넣기가 붙는 순간 생긴다)
      // 상한 계산과 동영상 판정이 옛 값으로 돌아 둘 다 뚫린다.
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

  // 실패한 것은 보낼 수 없으니 세지 않는다. 사용자가 지우지 않아도 나머지는
  // 보낼 수 있어야 한다.
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
