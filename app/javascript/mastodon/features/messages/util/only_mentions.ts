// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   본문이 수신자 핸들뿐인지.
//
//   사진만 보낸 메시지의 본문은 비어 있지 않다. 배달을 위해 핸들을 붙여 보내므로
//   (api/dm_rooms.ts) 본문이 "@alice" 하나다. 앞머리 핸들을 떼는
//   utils/strip_leading_mentions 는 **핸들만 있는 줄은 일부러 남긴다**(작성자가 쓴
//   줄을 지우지 않으려고). 그래서 사진 위에 "@alice" 만 든 말풍선이 따로 떴다.

const parser = new DOMParser();

const hrefOf = (node: Element) =>
  node.matches('a')
    ? node.getAttribute('href')
    : node.querySelector('a')?.getAttribute('href');

/**
 * 본문에 방 참여자 멘션 말고는 아무 글자도 없으면 true.
 * @param html 서버가 만든 본문 HTML
 * @param memberUrls 방 참여자의 프로필 URL
 * @returns 핸들뿐인 본문인지
 */
export const isOnlyMemberMentions = (html: string, memberUrls: Set<string>) => {
  const body = parser.parseFromString(html, 'text/html').body;
  const mentions = Array.from(body.querySelectorAll('.h-card, a.mention'));

  if (mentions.length === 0) return false;

  // 참여자가 아닌 사람을 부른 것은 작성자가 쓴 내용이다. 남긴다.
  if (mentions.some((node) => !memberUrls.has(hrefOf(node) ?? ''))) {
    return false;
  }

  mentions.forEach((node) => {
    node.remove();
  });

  return (body.textContent ?? '').trim() === '';
};
