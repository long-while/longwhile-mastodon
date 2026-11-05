> [!NOTE]
> Want to learn more about Mastodon?
> Click below to find out more in a video.

Mastodon is a **free, open-source social network server** based on [ActivityPub](https://www.w3.org/TR/activitypub/) where users can follow friends and discover new ones. On Mastodon, users can publish anything they want: links, pictures, text, and video. All Mastodon servers are interoperable as a federated network (users on one server can seamlessly communicate with users from another one, including non-Mastodon software that implements ActivityPub!)

## Navigation

- [Project homepage 🐘](https://joinmastodon.org)
- [Donate to support development 🎁](https://joinmastodon.org/sponsors#donate)
  - [View sponsors](https://joinmastodon.org/sponsors)
- [Blog 📰](https://blog.joinmastodon.org)
- [Documentation 📚](https://docs.joinmastodon.org)
- [Official container image 🚢](https://github.com/mastodon/mastodon/pkgs/container/mastodon)

## Features

**Part of the Fediverse. Based on open standards, with no vendor lock-in.** - the network goes beyond just Mastodon; anything that implements ActivityPub is part of a broader social network known as [the Fediverse](https://jointhefediverse.net/). You can follow and interact with users on other servers (including those running different software), and they can follow you back.

**Real-time, chronological timeline updates** - updates of people you're following appear in real-time in the UI.

**Media attachments** - upload and view images and videos attached to the updates. Videos with no audio track are treated like animated GIFs; normal videos loop continuously.

**Safety and moderation tools** - Mastodon includes private posts, locked accounts, phrase filtering, muting, blocking, and many other features, along with a reporting and moderation system.

**OAuth2 and a straightforward REST API** - Mastodon acts as an OAuth2 provider, and third party apps can use the REST and Streaming APIs. This results in a [rich app ecosystem](https://joinmastodon.org/apps) with a variety of choices!

## Deployment

### Tech stack

- [Ruby on Rails](https://github.com/rails/rails) powers the REST API and other web pages.
- [PostgreSQL](https://www.postgresql.org/) is the main database.
- [Redis](https://redis.io/) and [Sidekiq](https://sidekiq.org/) are used for caching and queueing.
- [Node.js](https://nodejs.org/) powers the streaming API.
- [React.js](https://reactjs.org/) and [Redux](https://redux.js.org/) are used for the dynamic parts of the interface.
- [BrowserStack](https://www.browserstack.com/) supports testing on real devices and browsers. (This project is tested with BrowserStack)
- [Chromatic](https://www.chromatic.com/) provides visual regression testing. (This project is tested with Chromatic)

### Requirements

- **PostgreSQL** 13+
- **Redis** 6.2+
- **Ruby** 3.2+
- **Node.js** 20+

This repository includes deployment configurations for **Docker and docker-compose**, as well as for other environments like Heroku and Scalingo. For Helm charts, reference the [mastodon/chart repository](https://github.com/mastodon/chart). A [**standalone** installation guide](https://docs.joinmastodon.org/admin/install/) is available in the main documentation.

## Contributing

Mastodon is **free, open-source software** licensed under **AGPLv3**. We welcome contributions and help from anyone who wants to improve the project.

You should read the overall [CONTRIBUTING](https://github.com/mastodon/.github/blob/main/CONTRIBUTING.md) guide, which covers our development processes.

You should also read and understand the [CODE OF CONDUCT](https://github.com/mastodon/.github/blob/main/CODE_OF_CONDUCT.md) that enables us to maintain a welcoming and inclusive community. Collaboration begins with mutual respect and understanding.

You can learn about setting up a development environment in the [DEVELOPMENT](docs/DEVELOPMENT.md) documentation.

If you would like to help with translations 🌐 you can do so on [Crowdin](https://crowdin.com/project/mastodon).

## 커스텀 기능 저작권 표시 (Custom Feature Attribution)

> 한국어 — 아래 커스텀 기능들은 **한참(@_longwhile)** 이 직접 제작했습니다.
> 이 기능들을 사용하거나 다른 서버/포크에 가져다 쓰려면, 서버 내(예: 소개/푸터/이용약관 등 이용자가 볼 수 있는 곳)에
> 아래 출처 중 **하나 이상**을 반드시 표기해야 합니다.
>
> English — The custom features listed below were created by **한참 (@_longwhile)**.
> If you use or port these features to another server/fork, you **must** display **at least one** of the
> credits below somewhere visible on your server (e.g. about page, footer, or terms).

**출처 / Credit**

- Twitter/X: [@_longwhile](https://twitter.com/_longwhile)
- Crepe(크레페): https://kre.pe/QTRx

**대상 기능 / Covered features**

| 기능 (KR) | Feature (EN) | 주요 파일 (Key files) |
| --- | --- | --- |
| 답장할 멘션 탭 (보류 멘션) | Pending mentions tab | `app/javascript/mastodon/features/pending-mentions/index.tsx`, `app/javascript/mastodon/selectors/notifications.ts`, `app/javascript/mastodon/reducers/statuses.js` |
| 마크다운 · 정렬 · 자동 링크 | Markdown / alignment / auto-link | `app/lib/text_formatter.rb`, `lib/sanitize_ext/sanitize_config.rb` |
| 계정 전환 (멀티계정) | Account switching (multi-account) | `config/initializers/multi_account.rb`, `app/services/multi_accounts/refresh_service.rb` |
| DM 운영진 열람 (admin/owner 전체 DM 열람) | Admin/owner DM viewing | `app/policies/status_policy.rb`, `app/lib/account_statuses_filter.rb`, `app/lib/feed_manager.rb`, `app/models/public_feed.rb`, `app/services/fan_out_on_write_service.rb` |
| 게시물 스크롤 오류 해결 | Status scroll fix | `app/javascript/mastodon/features/status/index.jsx`, `app/javascript/mastodon/reducers/contexts.ts` |
| 공지 계정(@longwhile) 노출 · 전체 브로드캐스트 | Announcement account exposure / broadcast | `app/models/public_feed.rb`, `app/services/fan_out_on_write_service.rb`, `app/validators/unreserved_username_validator.rb` |
| 프로텍트(잠금) 계정 · 관리자 보호 토글 | Protected (locked) account / admin toggle | `app/policies/account_policy.rb`, `app/controllers/admin/accounts_controller.rb`, `app/controllers/settings/profiles_controller.rb`, `app/models/account.rb`, `app/javascript/mastodon/components/account.tsx` |
| 검색 범위 제한 (나+팔로잉) | Search scope restriction | `app/lib/search_query_transformer.rb` |
| 팔로우 요청 자동 승인 | Auto-approve follow requests | `app/services/follow_service.rb` |
| 알림 진입 시 '모두' 탭 초기화 | Notifications reset to "All" tab | `app/javascript/mastodon/features/notifications_v2/index.tsx` |

각 파일 상단(또는 해당 코드 블록)에는 동일한 출처 표기 주석이 포함되어 있습니다.
A matching attribution comment is included at the top of each file (or above the relevant code block).

> 참고 / Note: 본 프로젝트의 베이스인 Mastodon 자체는 아래 AGPL 라이선스를 따릅니다.
> 위 표기 요청은 한참(@_longwhile)이 직접 작성한 커스텀 기능에 대한 것입니다.
> The base Mastodon project itself remains under the AGPL license shown below;
> the attribution request above applies to the custom features authored by 한참 (@_longwhile).

## LICENSE

Copyright (c) 2016-2026 Eugen Rochko (+ [`mastodon authors`](AUTHORS.md))

Licensed under GNU Affero General Public License as stated in the [LICENSE](LICENSE):

```text
Copyright (c) 2016-2026 Eugen Rochko & other Mastodon contributors

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License as published by the Free
Software Foundation, either version 3 of the License, or (at your option) any
later version.

This program is distributed in the hope that it will be useful, but WITHOUT
ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
details.

You should have received a copy of the GNU Affero General Public License along
with this program. If not, see https://www.gnu.org/licenses/
```