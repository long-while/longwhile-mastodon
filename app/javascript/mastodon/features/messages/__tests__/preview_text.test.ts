import type { PreviewLabels, PreviewSource } from '../util/preview_text';
import { previewText } from '../util/preview_text';

const labels: PreviewLabels = {
  photo: '사진',
  video: '동영상',
  audio: '소리',
  file: '파일',
  empty: '메시지 없음',
  contentWarning: (warning) => `열람 주의: ${warning}`,
  fromMe: (body) => `나: ${body}`,
  draft: (body) => `임시저장: ${body}`,
};

const source = (overrides: Partial<PreviewSource> = {}): PreviewSource => ({
  content: '<p>안녕하세요</p>',
  spoilerText: '',
  mediaTypes: [],
  isMine: false,
  ...overrides,
});

describe('previewText', () => {
  it('falls back to the empty label when there is no message', () => {
    expect(previewText(null, labels)).toBe('메시지 없음');
  });

  it('strips HTML down to plain text', () => {
    expect(previewText(source(), labels)).toBe('안녕하세요');
  });

  it('drops the mentions the composer put at the front', () => {
    const html =
      '<p><span class="h-card"><a href="https://example.com/@bob">@bob</a></span> 잘 지내?</p>';

    expect(previewText(source({ content: html }), labels)).toBe('잘 지내?');
  });

  it('keeps a mention that appears mid-sentence', () => {
    const html =
      '<p>어제 <span class="h-card"><a href="https://example.com/@bob">@bob</a></span> 봤어</p>';

    expect(previewText(source({ content: html }), labels)).toBe(
      '어제 @bob 봤어',
    );
  });

  it('collapses newlines into spaces', () => {
    expect(
      previewText(source({ content: '<p>첫 줄<br>둘째 줄</p>' }), labels),
    ).toBe('첫 줄 둘째 줄');
  });

  it('joins separate paragraphs with a space', () => {
    expect(
      previewText(source({ content: '<p>첫 문단</p><p>둘째 문단</p>' }), labels),
    ).toBe('첫 문단 둘째 문단');
  });

  it('names the attachment type when there is no body', () => {
    expect(
      previewText(source({ content: '', mediaTypes: ['image'] }), labels),
    ).toBe('사진');
    expect(
      previewText(source({ content: '', mediaTypes: ['video'] }), labels),
    ).toBe('동영상');
    expect(
      previewText(source({ content: '', mediaTypes: ['audio'] }), labels),
    ).toBe('소리');
    expect(
      previewText(source({ content: '', mediaTypes: ['unknown'] }), labels),
    ).toBe('파일');
  });

  it('shows the content warning instead of the body', () => {
    expect(
      previewText(
        source({ content: '<p>가려진 내용</p>', spoilerText: '스포일러' }),
        labels,
      ),
    ).toBe('열람 주의: 스포일러');
  });

  it('prefixes my own messages', () => {
    expect(previewText(source({ isMine: true }), labels)).toBe('나: 안녕하세요');
  });

  it('prefers a draft over the last message', () => {
    expect(previewText(source(), labels, '쓰다 만 말')).toBe(
      '임시저장: 쓰다 만 말',
    );
  });

  it('ignores a whitespace-only draft', () => {
    expect(previewText(source(), labels, '   ')).toBe('안녕하세요');
  });

  it('falls back to the empty label for a message with nothing in it', () => {
    expect(previewText(source({ content: '' }), labels)).toBe('메시지 없음');
  });

  describe('title change notices', () => {
    const titleEvent = (content: string) =>
      source({
        content,
        spoilerText: 'conversation:title_changed:',
      });

    it('shows the body instead of the marker', () => {
      expect(
        previewText(
          titleEvent('<p>한참 님이 대화 제목을 &#39;작전 회의&#39; 으로 바꿨습니다.</p>'),
          labels,
        ),
      ).toBe("한참 님이 대화 제목을 '작전 회의' 으로 바꿨습니다.");
    });

    it('never leaks the marker through the content warning label', () => {
      expect(previewText(titleEvent('<p>제목이 바뀌었습니다.</p>'), labels)).not.toContain(
        'conversation:title_changed:',
      );
    });

    it('falls back to the empty label when the body is missing', () => {
      expect(previewText(titleEvent(''), labels)).toBe('메시지 없음');
    });
  });
});
