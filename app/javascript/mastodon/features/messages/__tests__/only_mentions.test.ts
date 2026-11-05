import { isOnlyMemberMentions } from '../util/only_mentions';

const ALICE = 'https://example.com/@alice';
const BOB = 'https://example.com/@bob';

const mention = (url: string, name: string) =>
  `<span class="h-card" translate="no"><a href="${url}" class="u-url mention">@<span>${name}</span></a></span>`;

describe('isOnlyMemberMentions', () => {
  const members = new Set([ALICE, BOB]);

  it('is true when the body holds nothing but the members it was addressed to', () => {
    expect(
      isOnlyMemberMentions(
        `<p>${mention(ALICE, 'alice')} ${mention(BOB, 'bob')}</p>`,
        members,
      ),
    ).toBe(true);
  });

  it('is false once there is any text', () => {
    expect(
      isOnlyMemberMentions(
        `<p>${mention(ALICE, 'alice')} 사진이에요</p>`,
        members,
      ),
    ).toBe(false);
  });

  it('is false when someone outside the room is mentioned', () => {
    expect(
      isOnlyMemberMentions(
        `<p>${mention('https://example.com/@carol', 'carol')}</p>`,
        members,
      ),
    ).toBe(false);
  });

  it('is false for plain text without mentions', () => {
    expect(isOnlyMemberMentions('<p>안녕</p>', members)).toBe(false);
  });
});
