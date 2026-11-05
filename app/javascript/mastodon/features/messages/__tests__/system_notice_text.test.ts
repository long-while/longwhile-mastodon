// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅

import { systemNoticeText } from '../util/system_notice_text';

const mention = (name: string) =>
  `<span class="h-card" translate="no"><a href="https://example.com/@${name}" class="u-url mention">@<span>${name}</span></a></span>`;

describe('systemNoticeText', () => {
  // 서버는 배달을 위해 방 참여자 전원을 본문 앞에 멘션한다. 화면에는 문장만 남는다.
  it('drops the handles the server put in front of a member notice', () => {
    const html = `<p>${mention('alice')} ${mention('bob')} ${mention('carol')} 운영자 님이 앨리스 님을 초대했습니다.</p>`;

    expect(systemNoticeText(html)).toBe(
      '운영자 님이 앨리스 님을 초대했습니다.',
    );
  });

  it('drops the handles of a title notice and unescapes the quotes', () => {
    const html = `<p>${mention('alice')} 운영자 님이 대화 제목을 &#39;작전 회의&#39; 으로 바꿨습니다.</p>`;

    expect(systemNoticeText(html)).toBe(
      "운영자 님이 대화 제목을 '작전 회의' 으로 바꿨습니다.",
    );
  });

  it('keeps a notice that has no handles as it is', () => {
    expect(systemNoticeText('<p>운영자 님이 대화 제목을 지웠습니다.</p>')).toBe(
      '운영자 님이 대화 제목을 지웠습니다.',
    );
  });

  it('returns an empty string for an empty body', () => {
    expect(systemNoticeText(undefined)).toBe('');
    expect(systemNoticeText('')).toBe('');
  });
});
