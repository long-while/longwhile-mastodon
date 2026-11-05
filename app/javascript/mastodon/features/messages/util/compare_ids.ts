// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   메시지 id 비교.
//
//   id 는 눈금이 촘촘한 snowflake 라 그냥 문자열로 비교하면 자릿수 때문에 어긋난다
//   ("9" > "10"). 길이를 먼저 보고 같을 때만 사전순으로 본다. Number 로 바꾸지
//   않는 이유는 snowflake 가 2^53 을 넘어 정밀도를 잃기 때문이다.
export const compareIds = (a: string, b: string) =>
  a.length === b.length ? a.localeCompare(b) : a.length - b.length;
