// @_longwhile custom feature

import { stripLeadingMentions } from '../util/strip_leading_mentions';

describe('stripLeadingMentions', () => {
  it('앞머리의 핸들 하나를 뗀다', () => {
    expect(stripLeadingMentions('@alice 안녕')).toBe('안녕');
  });

  it('여러 명이면 전부 뗀다 (그룹 방)', () => {
    expect(stripLeadingMentions('@alice @bob @carol 다들 안녕')).toBe(
      '다들 안녕',
    );
  });

  it('도메인이 붙은 핸들도 뗀다', () => {
    expect(stripLeadingMentions('@alice@example.com 안녕')).toBe('안녕');
  });

  it('본문 중간의 멘션은 건드리지 않는다', () => {
    expect(stripLeadingMentions('@alice 이거 @bob 한테도 보여줘')).toBe(
      '이거 @bob 한테도 보여줘',
    );
  });

  it('핸들 뒤의 줄바꿈은 남긴다', () => {
    expect(stripLeadingMentions('@alice \n\n안녕')).toBe('\n\n안녕');
  });

  it('핸들이 없으면 그대로 둔다', () => {
    expect(stripLeadingMentions('안녕')).toBe('안녕');
  });

  it('본문이 @ 로 시작하지 않으면 아무것도 떼지 않는다', () => {
    expect(stripLeadingMentions('메일은 a@b.com 으로')).toBe(
      '메일은 a@b.com 으로',
    );
  });

  it('빈 문자열을 견딘다', () => {
    expect(stripLeadingMentions('')).toBe('');
  });
});
