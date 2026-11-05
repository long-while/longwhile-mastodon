import { systemNoticeText } from '../util/system_notice_text';

const mention = (name: string) =>
  `<span class="h-card" translate="no"><a href="https://example.com/@${name}" class="u-url mention">@<span>${name}</span></a></span>`;

describe('systemNoticeText', () => {
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
