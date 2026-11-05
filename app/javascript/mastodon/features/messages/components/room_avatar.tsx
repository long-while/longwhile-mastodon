// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   방의 얼굴. 1대1 이면 상대 아바타 하나, 그룹이면 **둘을 겹친 것**.
//   근거: docs/dm-chat/phases/dm-chat-phase-5.md §4.1·§4.2
//
//   헤더와 목록 카드가 함께 쓴다. 두 곳에서 따로 분기하면 한쪽만 그룹을 처리하는
//   상태가 생긴다 — 실제로 Phase 2 까지 헤더는 `accounts[0]` 만 그리고 있었고,
//   그룹 방에서는 세 명 중 한 명의 얼굴만 나왔다.
//
//   **상류 `AvatarComposite` 를 쓰지 않는다** (2026-08-12 에 바꿨다). 그것은
//   인원수에 따라 2·3·4 칸으로 쪼개 붙이는데, 48px 안에서 넷으로 쪼개면 한 칸이
//   24px 도 안 되어 누구인지 알아볼 수 없다. **인원과 무관하게 앞의 두 명만**
//   겹쳐 그린다 — 몇 명인지는 이름 줄이 이미 말하고 있고, 얼굴 자리가 할 일은
//   "여럿이다" 를 알리고 방을 서로 구별시키는 것뿐이다.

import { useMemo } from 'react';

import { Avatar } from 'mastodon/components/avatar';
import type { Account } from 'mastodon/models/account';
import { useAppSelector } from 'mastodon/store';

import { selectMessageAccountsMap } from '../selectors';

// 겹친 아바타 하나의 크기. 컨테이너 대비 비율이다.
const GROUP_SCALE = 0.72;

// 앞 아바타 둘레에 두는 빈 틈. 뒤 아바타를 이만큼 더 도려낸다.
const GROUP_GAP = 2;

interface Props {
  // 방의 **상대** 계정 id. 서버가 주는 `room.accounts` 는 나를 뺀 목록이다.
  accountIds: string[];
  size: number;
}

export const RoomAvatar: React.FC<Props> = ({ accountIds, size }) => {
  // **맵을 통째로 받아 여기서 뽑는다.** 셀렉터 안에서 `accountIds.map(...)` 을
  // 하면 매번 새 배열이 나오고, `useAppSelector` 는 참조 비교라 **디스패치마다
  // 리렌더된다.** 스트림이 도는 화면에서는 그게 초당 몇 번이다.
  const accountsMap = useAppSelector(selectMessageAccountsMap);

  // 목록을 만들 때 쓰는 열쇠. id 목록이 같으면 다시 만들지 않는다 — 매번 새 List
  // 를 넘기면 AvatarComposite 가 PureComponent 라도 참조가 달라져 늘 다시 그린다.
  const key = accountIds.join(',');

  const present = useMemo(
    () =>
      accountIds
        .map((id) => accountsMap.get(id))
        .filter((account): account is Account => Boolean(account)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountsMap, key],
  );

  // 뒤 아바타에서 도려낼 원. **테두리를 배경색으로 칠하지 않는다** — 목록
  // 항목은 호버·선택에서 배경을 바꾸므로(`--color-recieve-message-background`,
  // `--color-hover-message-list-background`) 고정 색 테두리는 그때 어긋난다.
  // 마스크로 실제로 뚫으면 뒤에 무엇이 있든 맞는다.
  const maskImage = useMemo(() => {
    const inner = Math.round(size * GROUP_SCALE);

    // 앞 아바타의 중심. 오른쪽 아래에 붙으므로 컨테이너 좌표로 이 값이고,
    // 뒤 아바타도 왼쪽 위(0,0)에서 시작하므로 같은 좌표를 그대로 쓴다.
    const center = size - inner / 2;
    const radius = inner / 2 + GROUP_GAP;

    // 98% → 100% 는 계단을 없애기 위한 것이다. 딱 잘라내면 원 가장자리가 톱니로
    // 남는다.
    return `radial-gradient(circle ${radius}px at ${center}px ${center}px, rgba(0, 0, 0, 0) 98%, rgba(0, 0, 0, 1) 100%)`;
  }, [size]);

  // 아직 계정이 안 들어왔다. 빈 자리를 남기지 않는다 — 아바타 자리가 비면 줄이
  // 흔들렸다가 도착할 때 다시 잡힌다.
  if (present.length === 0) return null;

  const [back, front] = present;

  if (!back) return null;

  if (!front) {
    return <Avatar account={back} size={size} />;
  }

  const inner = Math.round(size * GROUP_SCALE);

  return (
    <div
      className='dm-room-avatar dm-room-avatar--group'
      style={{ width: size, height: size }}
    >
      <div
        className='dm-room-avatar__back'
        style={{ maskImage, WebkitMaskImage: maskImage }}
      >
        <Avatar account={back} size={inner} />
      </div>

      <div className='dm-room-avatar__front'>
        <Avatar account={front} size={inner} />
      </div>
    </div>
  );
};
