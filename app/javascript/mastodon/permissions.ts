export const PERMISSION_INVITE_USERS = 0x0000000000010000;
export const PERMISSION_MANAGE_USERS = 0x0000000000000400;
export const PERMISSION_MANAGE_TAXONOMIES = 0x0000000000000100;
export const PERMISSION_MANAGE_FEDERATION = 0x0000000000000020;

export const PERMISSION_MANAGE_REPORTS = 0x0000000000000010;
export const PERMISSION_VIEW_DASHBOARD = 0x0000000000000008;

// These helpers don't quite align with the names/categories in UserRole,
// but are likely "good enough" for the use cases at present.
//
// See: https://docs.joinmastodon.org/entities/Role/#permission-flags

export function canViewAdminDashboard(permissions: number) {
  return (
    (permissions & PERMISSION_VIEW_DASHBOARD) === PERMISSION_VIEW_DASHBOARD
  );
}

export function canManageReports(permissions: number) {
  return (
    (permissions & PERMISSION_MANAGE_REPORTS) === PERMISSION_MANAGE_REPORTS
  );
}

// @_longwhile — DM 운영 열람(/messages/all) 권한.
//   서버의 Admin::DirectMessagePolicy 가 `role.can?(:administrator, :manage_roles)`
//   를 쓰므로 그것과 같은 판정을 한다. 둘이 갈라지면 화면은 보이는데 API 가 403 을
//   주거나(또는 그 반대) 하는 상태가 된다.
//   administrator 는 모든 권한을 포함하는 owner 전용 비트라 따로 보지 않아도
//   되지만, 정책이 둘을 함께 보므로 여기서도 함께 본다.
export const PERMISSION_ADMINISTRATOR = 0x0000000000000001;
export const PERMISSION_MANAGE_ROLES = 0x0000000000020000;

export function canManageDirectMessages(permissions: number) {
  return (
    (permissions & PERMISSION_ADMINISTRATOR) === PERMISSION_ADMINISTRATOR ||
    (permissions & PERMISSION_MANAGE_ROLES) === PERMISSION_MANAGE_ROLES
  );
}
