const parser = new DOMParser();

const hrefOf = (node: Element) =>
  node.matches('a')
    ? node.getAttribute('href')
    : node.querySelector('a')?.getAttribute('href');

export const isOnlyMemberMentions = (html: string, memberUrls: Set<string>) => {
  const body = parser.parseFromString(html, 'text/html').body;
  const mentions = Array.from(body.querySelectorAll('.h-card, a.mention'));

  if (mentions.length === 0) return false;

  if (mentions.some((node) => !memberUrls.has(hrefOf(node) ?? ''))) {
    return false;
  }

  mentions.forEach((node) => {
    node.remove();
  });

  return (body.textContent ?? '').trim() === '';
};
