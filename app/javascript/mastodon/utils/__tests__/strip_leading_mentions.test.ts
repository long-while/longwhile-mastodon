import { stripLeadingMentions } from '../strip_leading_mentions';

const url = (handle: string) => `https://example.com/@${handle}`;

const mention = (handle: string) =>
  `<span class="h-card" translate="no"><a href="${url(handle)}" class="u-url mention">@<span>${handle}</span></a></span>`;

const carriedOver = (...handles: string[]) => new Set(handles.map(url));

describe('stripLeadingMentions', () => {
  it('drops the handles the composer carried over', () => {
    const html = `<p>${mention('chul_su')} ${mention('longwhile')} Blackjack, anyone?</p>`;

    expect(stripLeadingMentions(html, carriedOver('chul_su', 'longwhile'))).toBe(
      '<p>Blackjack, anyone?</p>',
    );
  });

  it('keeps someone the reply is bringing into the conversation', () => {
    // @newcomer is not part of the thread yet, so naming them is information.
    const html = `<p>${mention('newcomer')} ${mention('longwhile')} over here</p>`;

    const result = stripLeadingMentions(html, carriedOver('longwhile'));

    expect(result).toContain(url('newcomer'));
    expect(result).not.toContain(url('longwhile'));
  });

  it('keeps a mention the author wrote inside the sentence', () => {
    const html = `<p>${mention('a')} over here, ${mention('b')} too</p>`;

    const result = stripLeadingMentions(html, carriedOver('a', 'b'));

    expect(result).not.toContain(url('a'));
    expect(result).toContain(url('b'));
  });

  it('leaves a line that holds nothing but mentions alone', () => {
    // Emptying it would erase a line the author chose to write.
    const html = `<p>${mention('a')} ${mention('b')}</p><p>The actual message</p>`;

    expect(stripLeadingMentions(html, carriedOver('a', 'b'))).toBe(html);
  });

  it('leaves a post that is nothing but mentions alone', () => {
    const html = `<p>${mention('a')} ${mention('b')}</p>`;

    expect(stripLeadingMentions(html, carriedOver('a', 'b'))).toBe(html);
  });

  it('drops the line break left behind by a mention on its own line', () => {
    const html = `<p>${mention('a')}<br>Second line</p>`;

    expect(stripLeadingMentions(html, carriedOver('a'))).toBe('<p>Second line</p>');
  });

  it('leaves a post without carried-over mentions untouched', () => {
    const html = `<p>${mention('a')} hello</p>`;

    expect(stripLeadingMentions(html, carriedOver())).toBe(html);
  });

  it('passes an empty body through', () => {
    expect(stripLeadingMentions('', carriedOver('a'))).toBe('');
  });
});
