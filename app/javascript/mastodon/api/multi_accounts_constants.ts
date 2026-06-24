// 멀티계정 네트워크 호출 공용 타임아웃(ms). axios 인스턴스에는 전역 timeout이
// 없어 응답이 안 오면 await가 무한 대기 → 계정 스위처 버튼이 회색으로 멈춘다.
// 각 멀티계정 호출에 per-request timeout을 걸어 반드시 settle 되도록 한다.
//
// 이 상수는 의존성 없는 별도 모듈에 둔다. multi_accounts.ts 는 동적 import 전용
// (lazy chunk)이라, 상수를 거기서 정적 import 하면 모듈 전체가 메인 청크로 끌려와
// 코드 분할이 깨진다(Rollup "dynamically imported ... also statically imported" 경고).
export const MULTI_ACCOUNT_REQUEST_TIMEOUT = 15000;
