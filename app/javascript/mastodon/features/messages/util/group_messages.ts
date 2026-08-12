// @_longwhile custom feature

export const GROUP_WINDOW_MS = 3 * 60 * 1000;

export const TIME_GAP_MS = 10 * 60 * 1000;

export interface GroupableMessage {
  id: string;
  accountId: string;
  createdAt: string;

  quotesAnotherMessage: boolean;
}

export interface PositionedMessage<T extends GroupableMessage> {
  message: T;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;

  showTimestamp: boolean;
}

export interface MessageGroup<T extends GroupableMessage> {
  key: string;
  accountId: string;
  messages: PositionedMessage<T>[];
}

export interface DateSection<T extends GroupableMessage> {
  key: string;

  date: Date;
  groups: MessageGroup<T>[];
}

const startOfLocalDay = (value: Date) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();

const timeOf = (message: GroupableMessage) =>
  new Date(message.createdAt).getTime();

export const groupMessages = <T extends GroupableMessage>(
  messages: T[],
): DateSection<T>[] => {
  const sections: DateSection<T>[] = [];

  messages.forEach((message) => {
    const at  = timeOf(message);
    const day = startOfLocalDay(new Date(at));

    let section = sections.at(-1);

    if (!section || startOfLocalDay(section.date) !== day) {
      section = { key: `date-${day}`, date: new Date(at), groups: [] };
      sections.push(section);
    }

    const group    = section.groups.at(-1);
    const previous = group?.messages.at(-1);

    const continuesGroup =
      group !== undefined &&
      previous !== undefined &&
      group.accountId === message.accountId &&
      at - timeOf(previous.message) <= GROUP_WINDOW_MS &&
      !message.quotesAnotherMessage;

    const entry: PositionedMessage<T> = {
      message,
      isFirstInGroup: !continuesGroup,
      isLastInGroup: true,
      showTimestamp: false,
    };

    if (continuesGroup) {
      previous.isLastInGroup = false;
      group.messages.push(entry);
    } else {
      section.groups.push({
        key: `group-${message.id}`,
        accountId: message.accountId,
        messages: [entry],
      });
    }
  });

  markTimestamps(sections);

  return sections;
};

const markTimestamps = <T extends GroupableMessage>(
  sections: DateSection<T>[],
) => {
  const groups = sections.flatMap((section) => section.groups);

  groups.forEach((group, index) => {
    const last = group.messages.at(-1);
    if (!last) return;

    const nextGroup = groups[index + 1];
    const nextFirst = nextGroup?.messages[0];

    last.showTimestamp =
      !nextFirst ||
      timeOf(nextFirst.message) - timeOf(last.message) >= TIME_GAP_MS;
  });
};
