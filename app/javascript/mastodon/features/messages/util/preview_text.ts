// @_longwhile custom feature

import { isTitleEvent } from './title_event';

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

export const previewText = (
  source: PreviewSource | null | undefined,
  labels: PreviewLabels,
  draft?: string,
) => {
  if (draft && draft.trim() !== '') {
    return labels.draft(draft.replace(/\s+/g, ' ').trim());
  }

  if (!source) return labels.empty;

  if (isTitleEvent(source.spoilerText)) {
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
