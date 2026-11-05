// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   말풍선 묶기·날짜 구분선·시각 표시 규칙.
//   근거: dm-chat-phase-2.md §6, 기획서 §4.3.3~4.3.5

// 연속으로 온 메시지를 한 덩어리로 묶는 간격.
export const GROUP_WINDOW_MS = 3 * 60 * 1000;

export interface GroupableMessage {
  id: string;
  accountId: string;
  createdAt: string;

  // 명시적 답장 인용이 붙은 메시지는 앞 메시지와 묶지 않는다. 인용 상자가 붙는
  // 메시지는 시각적으로 독립해야 읽힌다.
  quotesAnotherMessage: boolean;

  // 덩어리에 섞이지 않는 메시지. 방 제목 변경 안내가 여기 해당한다 (Phase 5).
  //
  // **앞의 것과 묶이지 않고, 뒤의 것도 이것과 묶이지 않는다.** 안내는 말풍선이
  // 아니라 가운데 정렬 문장으로 그려지는데, 그것이 덩어리 한가운데 끼면 위아래
  // 말풍선이 한 덩어리인 채로 갈라져 여백 규칙이 어긋난다.
  //
  // `quotesAnotherMessage` 와 다른 점은 **뒤쪽까지 끊는다**는 것이다. 인용은
  // 자기만 떨어져 나오면 되지만 안내는 양쪽을 갈라야 한다.
  standalone?: boolean;
}

export interface PositionedMessage<T extends GroupableMessage> {
  message: T;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;

  // 덩어리의 마지막이면 시각을 붙인다.
  showTimestamp: boolean;

  // 이 덩어리가 **발신자가 바뀌어서** 시작했는가. `isFirstInGroup` 일 때만 뜻이
  // 있다.
  //
  // 덩어리가 나뉘는 이유는 둘인데 필요한 여백이 다르다.
  //   발신자 전환 — 짧게 주고받는 대화에서는 **거의 모든 메시지**가 여기 걸린다.
  //                 덩어리 사이 여백을 그대로 주면 대화가 세로로 두 배가 된다.
  //   같은 사람의 시간차 — 드물게 일어나고, 대화가 끊겼다 이어진 지점이라 크게
  //                 벌리는 편이 읽기 쉽다.
  // 화면 쪽에서 이 값으로 여백을 가른다(`.dm-message--sender-changed`).
  isSenderChanged: boolean;
}

export interface MessageGroup<T extends GroupableMessage> {
  key: string;
  accountId: string;
  messages: PositionedMessage<T>[];
}

export interface DateSection<T extends GroupableMessage> {
  key: string;

  // 이 날짜 구분선이 걸리는 날의 아무 시각. 화면은 보는 사람의 지역 시간대로
  // 판정한다 — 같은 메시지가 사람에 따라 다른 날짜 아래 놓이는 것은 정상이다.
  date: Date;
  groups: MessageGroup<T>[];
}

const startOfLocalDay = (value: Date) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();

const timeOf = (message: GroupableMessage) =>
  new Date(message.createdAt).getTime();

/**
 * 메시지 배열(오름차순)을 날짜 구분선 → 덩어리 → 메시지로 접는다.
 *
 * **전체 목록에 대한 순수 함수다. 부분 계산이나 증분 갱신을 하지 않는다.**
 * 과거 페이지를 앞에 붙이면 기존 첫 메시지의 묶임 상태가 바뀌는데(단독 → 덩어리
 * 마지막), 그러면 여백·모서리·아바타가 전부 달라진다. Phase 3 의 스크롤 위치
 * 보정은 "추가 전후 높이 차이" 로 계산하므로 그 변화가 이미 반영된 상태여야 한다.
 * 증분으로 갱신하면 보정이 어긋나 화면이 튄다.
 * 근거: dm-chat-phase-2.md §6.4, 검토 S-9
 * @param messages 오름차순으로 정렬된 메시지
 * @returns 날짜 구분선으로 나뉜 덩어리 목록
 */
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
      !message.quotesAnotherMessage &&
      !message.standalone &&
      !previous.message.standalone;

    const entry: PositionedMessage<T> = {
      message,
      isFirstInGroup: !continuesGroup,
      isLastInGroup: true,
      showTimestamp: false,
      isSenderChanged: false,
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
  markSenderChanges(sections);

  return sections;
};

// 덩어리가 나뉜 **이유**를 표시한다. 날짜 구분선을 넘어서도 이어 보는 이유는,
// 자정을 넘겨 같은 사람이 이어 말한 것과 상대가 답한 것이 화면에서 달라야 하기
// 때문이다.
const markSenderChanges = <T extends GroupableMessage>(
  sections: DateSection<T>[],
) => {
  const groups = sections.flatMap((section) => section.groups);

  groups.forEach((group, index) => {
    const first = group.messages[0];
    const previous = groups[index - 1];

    // 목록의 맨 처음 덩어리에는 앞이 없다. 위쪽 여백은 방 소개나 날짜 구분선이
    // 이미 만들고 있으므로 `false` 로 둔다.
    if (first && previous) {
      first.isSenderChanged = previous.accountId !== group.accountId;
    }
  });
};

// 덩어리의 마지막 메시지에는 **항상** 시각을 붙인다.
//
// 다음 덩어리와 10분 이상 벌어졌을 때만 붙이던 규칙이 있었는데 지웠다. 그 규칙은
// 시각을 말풍선 **안에** 인라인으로 넣는 화면(트위터)에서만 값을 한다 — 거기서는
// 시각이 본문의 가로 폭을 잡아먹으니 아낄 이유가 있다.
//
// 우리는 시각을 말풍선 **바깥** 옆에 세로로 세운다(message_bubble.tsx 의 `__meta`).
// 그 칸은 말풍선 옆 빈 자리에 앉아 세로 높이를 만들지 않고, 말풍선 폭은 어차피
// `max-width` 로 묶여 있어 줄바꿈도 달라지지 않는다. **표시 비용이 사실상 0이라
// 감출 이유가 없다.** 참조로 삼은 두 서비스도 1분 간격 덩어리에 시각을 전부 낸다.
const markTimestamps = <T extends GroupableMessage>(
  sections: DateSection<T>[],
) => {
  sections.forEach((section) => {
    section.groups.forEach((group) => {
      const last = group.messages.at(-1);
      if (last) last.showTimestamp = true;
    });
  });
};
