// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   목록 카드의 한 줄 미리보기.
//   근거: dm-chat-phase-2.md §3.3, 기획서 §4.2.3

import { isSystemEvent } from './title_event';

export interface PreviewSource {
  content: string;
  spoilerText: string;
  mediaTypes: string[];
  isMine: boolean;
}

export interface PreviewLabels {
  photo: string;
  video: string;
  audio: string;
  file: string;
  contentWarning: (warning: string) => string;
  fromMe: (body: string) => string;
  draft: (body: string) => string;
  empty: string;
}

// 본문 앞 멘션은 화면에서 지운다. 이걸 빼먹으면 모든 미리보기가 상대 핸들로
// 시작해서 무슨 대화인지 알 수 없게 된다.
//
// DOMParser 로 파싱해서 지운다. 정규식 문자열 치환은 쓰지 않는다(기획서 §11.5).
// CSS 로 감추는 것도 안 된다 — 복사하면 멘션이 딸려오고 스크린 리더가 읽는다.
const stripLeadingMentionNodes = (html: string) => {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const root     = document.body.firstElementChild ?? document.body;

  let node = root.firstChild;

  while (node) {
    const next = node.nextSibling;

    if (node.nodeType === Node.TEXT_NODE) {
      if ((node.textContent ?? '').trim() !== '') break;
      node.parentNode?.removeChild(node);
    } else if (
      node.nodeType === Node.ELEMENT_NODE &&
      (node as Element).classList.contains('h-card')
    ) {
      node.parentNode?.removeChild(node);
    } else {
      break;
    }

    node = next;
  }

  // textContent 는 <br> 과 문단 경계를 통째로 버려서 "첫 줄둘째 줄" 이 된다.
  // 줄바꿈을 공백으로 바꾸는 것이 7단계 중 3단계다.
  document.body.querySelectorAll('br').forEach((br) => {
    br.replaceWith(document.createTextNode(' '));
  });

  return Array.from(document.body.childNodes)
    .map((node) => node.textContent ?? '')
    .join(' ');
};

const mediaLabel = (types: string[], labels: PreviewLabels) => {
  const first = types[0];

  if (first === 'video' || first === 'gifv') return labels.video;
  if (first === 'audio') return labels.audio;
  if (first === 'image') return labels.photo;

  return labels.file;
};

/**
 * 미리보기 한 줄을 만든다. 우선순위대로 7단계 (기획서 §4.2.3).
 *
 *   1. 본문 앞 멘션 제거
 *   2. HTML 태그 제거
 *   3. 줄바꿈 → 공백
 *   4. 본문 없이 첨부만 있으면 종류별 문구
 *   5. 콘텐츠 워닝이 있으면 본문 대신 경고 문구
 *   6. 내 메시지면 앞에 "나: "
 *   7. 말줄임은 CSS 가 한다(글꼴 폭에 따라 달라지므로 여기서 자르지 않는다)
 * @param source 마지막 메시지. 없으면 빈 방이다
 * @param labels 번역된 문구
 * @param draft 작성 중인 초안. 있으면 마지막 메시지 대신 보여준다
 * @returns 목록 카드에 넣을 한 줄
 */
export const previewText = (
  source: PreviewSource | null | undefined,
  labels: PreviewLabels,
  draft?: string,
) => {
  // 초안이 있으면 마지막 메시지 대신 보여준다. (FR-21)
  if (draft && draft.trim() !== '') {
    return labels.draft(draft.replace(/\s+/g, ' ').trim());
  }

  if (!source) return labels.empty;

  // 방 안내(제목 변경·멤버 변경)는 표식을 벗기고 **본문**을 보여준다 (Phase 5).
  //
  // 그러지 않으면 목록에 "열람 주의: conversation:title_changed:" 가 뜬다.
  // 표식이 spoiler_text 에 있어 아래 콘텐츠 워닝 분기에 그대로 걸리기 때문이다.
  // 여기가 표식이 화면으로 새는 **세 자리 중 하나**다(방·목록·미리보기).
  // 한때 제목 변경만 걸러, 멤버 변경이 마지막 글인 방은 목록에 표식이 그대로 떴다.
  if (isSystemEvent(source.spoilerText)) {
    const notice = stripLeadingMentionNodes(source.content)
      .replace(/\s+/g, ' ')
      .trim();

    return notice || labels.empty;
  }

  const body = source.spoilerText.trim()
    ? labels.contentWarning(source.spoilerText.trim())
    : (stripLeadingMentionNodes(source.content).replace(/\s+/g, ' ').trim() ||
      (source.mediaTypes.length > 0 ? mediaLabel(source.mediaTypes, labels) : ''));

  if (!body) return labels.empty;

  return source.isMine ? labels.fromMe(body) : body;
};
