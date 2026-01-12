# 한참 인스턴스 (Mastodon Custom)

> 자캐커뮤를 위한 특별한 마스토돈

**한참 인스턴스**는 자캐커뮤 운영과 러닝에 최적화된 마스토돈 커스텀 버전입니다. 2024년 6월부터 현재까지 20개 이상의 서버에 설치되어 많은 커뮤니티에서 사용되고 있습니다.

기본 마스토돈의 진입장벽을 낮추고, 커뮤니티 운영에 필요한 기능들을 추가하여 운영진과 러너 모두에게 편리한 환경을 제공합니다.

---

## ✨ 주요 특징

### 🔄 다중계정 로그인 & 계정 전환
마스토돈 웹에서 여러 계정을 동시에 로그인하고 손쉽게 전환할 수 있습니다. (2024.11.15 구현)

### 🎨 익숙한 UI
트위터 기반 인터페이스로 마스토돈이 처음인 러너도 편하게 사용할 수 있습니다.

### 🔒 비공개 서버
- 로그인하지 않은 사용자에게 툿이 노출되지 않음
- 서버에 가입하지 않은 사용자에게 툿이 노출되지 않음
- 연합 제한으로 타 서버로 콘텐츠가 유출되지 않음

### 📨 DM 관리 기능
운영계가 서버 내 모든 DM을 하나의 페이지에서 확인할 수 있습니다. (계정 DM창과 별개 페이지)

### 🔤 깔끔한 폰트
KoPub 돋움 ttf 적용으로 Windows PC 웹에서도 눈이 피로하지 않은 가독성을 제공합니다.

### 📝 바이오 표시
팔로잉/팔로워 목록에서 각 계정의 바이오를 바로 확인할 수 있습니다.

### ✍️ 마크다운 기능
- `*기울임*` → *기울임*
- `**볼드**` → **볼드**
- `***굵은 기울임***` → ***굵은 기울임***
- `~~취소선~~` → ~~취소선~~

### 🔔 알림창 분리
알림창이 3가지 탭으로 구성되어 효율적인 알림 관리가 가능합니다:
1. **모든 알림** - 좋아요, 리트윗 등
2. **멘션** - 멘션만 모아보기
3. **DM** - DM만 모아보기

### 📊 퍼블릭 툿 타임라인
- **홈 타임라인**: 모든 멘션이 보이는 타임라인
- **퍼블릭 피드**: 퍼블릭 툿만 모아볼 수 있는 깔끔한 피드

### 📏 넉넉한 글자수 제한
트위터의 240자가 아닌 **1,000자**까지 작성 가능합니다.

### 🐛 오류 수정
- DM과 팔로워 공개 툿에도 답글 수 표시
- 스크롤 오류 수정 (답멘 선택 시 스크롤이 맨 위로 올라가는 문제 해결)

---

## ⚠️ 주의사항

**호환성 문제로 인해 다음 기능은 지원하지 않습니다:**
- 고급 인터페이스 (Advanced UI)
- 커스텀 이모지

---

## 📖 마스토돈에 대하여

마스토돈(Mastodon)은 [ActivityPub](https://www.w3.org/TR/activitypub/)을 기반으로 하는 **자유 오픈 소스 소셜 네트워크 서버**로, 사용자는 친구를 팔로우하고 새로운 친구를 발견할 수 있습니다. 마스토돈에서 사용자는 링크, 사진, 텍스트, 비디오 등 원하는 무엇이든 게시할 수 있습니다. 모든 마스토돈 서버는 연합 네트워크(Federated Network)로서 상호 운용이 가능합니다. 즉, 한 서버의 사용자가 다른 서버의 사용자와 원활하게 통신할 수 있으며, 여기에는 ActivityPub을 구현한 마스토돈 이외의 소프트웨어도 포함됩니다!

## 탐색 (Navigation)

- [프로젝트 홈페이지 🐘](https://joinmastodon.org)
- [개발 후원하기 🎁](https://joinmastodon.org/sponsors#donate)
  - [후원사 보기](https://joinmastodon.org/sponsors)
- [블로그 📰](https://blog.joinmastodon.org)
- [문서 📚](https://docs.joinmastodon.org)
- [공식 컨테이너 이미지 🚢](https://github.com/mastodon/mastodon/pkgs/container/mastodon)

## 주요 기능 (Features)

**페디버스(Fediverse)의 일원. 특정 업체에 종속되지 않는 개방형 표준 기반.** - 이 네트워크는 단순히 마스토돈에 그치지 않습니다. ActivityPub을 구현하는 모든 것은 [페디버스(Fediverse)](https://jointhefediverse.net/)라고 불리는 더 넓은 소셜 네트워크의 일부가 됩니다. 다른 서버(다른 소프트웨어를 실행하는 서버 포함)의 사용자를 팔로우하고 소통할 수 있으며, 그들도 여러분을 팔로우할 수 있습니다.

**실시간, 연대기순 타임라인 업데이트** - 팔로우 중인 사람들의 업데이트가 사용자 인터페이스(UI)에 실시간으로 나타납니다.

**미디어 첨부** - 업데이트에 첨부된 이미지와 비디오를 업로드하고 볼 수 있습니다. 오디오 트랙이 없는 비디오는 애니메이션 GIF처럼 처리되며, 일반 비디오는 연속적으로 반복 재생됩니다.

**안전 및 관리(Moderation) 도구** - 마스토돈에는 비공개 게시물, 잠금 계정, 문구 필터링, 뮤트(숨기기), 차단 등 다양한 기능과 함께 신고 및 관리 시스템이 포함되어 있습니다.

**OAuth2 및 직관적인 REST API** - 마스토돈은 OAuth2 제공자 역할을 하며, 서드파티 앱은 REST 및 스트리밍 API를 사용할 수 있습니다. 이를 통해 다양한 선택권을 가진 [풍부한 앱 생태계](https://joinmastodon.org/apps)가 구축되어 있습니다!

## 배포 (Deployment)

### 기술 스택 (Tech stack)

- [Ruby on Rails](https://github.com/rails/rails): REST API 및 웹 페이지 구동.
- [PostgreSQL](https://www.postgresql.org/): 메인 데이터베이스.
- [Redis](https://redis.io/) 및 [Sidekiq](https://sidekiq.org/): 캐싱 및 큐(Queueing) 작업.
- [Node.js](https://nodejs.org/): 스트리밍 API 구동.
- [React.js](https://reactjs.org/) 및 [Redux](https://redux.js.org/): 인터페이스의 동적인 부분 구현.
- [BrowserStack](https://www.browserstack.com/): 실제 기기 및 브라우저 테스트 지원. (본 프로젝트는 BrowserStack으로 테스트되었습니다.)
- [Chromatic](https://www.chromatic.com/): 시각적 회귀 테스트(Visual regression testing) 제공. (본 프로젝트는 Chromatic으로 테스트되었습니다.)

### 요구 사항 (Requirements)

- **Ruby** 3.2+
- **PostgreSQL** 12+
- **Redis** 4.0+
- **Node.js** 18+

이 저장소에는 **Docker 및 docker-compose**를 위한 배포 설정뿐만 아니라 Heroku, Scalingo와 같은 다른 환경을 위한 설정도 포함되어 있습니다. Helm 차트의 경우 [mastodon/chart 저장소](https://github.com/mastodon/chart)를 참조하세요. [**독립형(Standalone)** 설치 가이드](https://docs.joinmastodon.org/admin/install/)는 메인 문서에서 확인할 수 있습니다.

## 기여하기 (Contributing)

마스토돈은 **AGPLv3 라이선스** 하에 배포되는 **자유 오픈 소스 소프트웨어**입니다. 프로젝트를 개선하고자 하는 모든 분의 기여와 도움을 환영합니다.

개발 프로세스를 다루는 전체 [CONTRIBUTING](https://github.com/mastodon/.github/blob/main/CONTRIBUTING.md) 가이드를 읽어주시기 바랍니다.

또한, 환영받고 포용적인 커뮤니티를 유지할 수 있도록 하는 [CODE OF CONDUCT(행동 강령)](https://github.com/mastodon/.github/blob/main/CODE_OF_CONDUCT.md)을 읽고 이해해 주시기 바랍니다. 협업은 상호 존중과 이해에서 시작됩니다.

개발 환경 설정에 대해서는 [DEVELOPMENT](docs/DEVELOPMENT.md) 문서에서 배울 수 있습니다.

**번역** 🌐에 도움을 주고 싶으시다면 [Crowdin](https://crowdin.com/project/mastodon)에서 참여하실 수 있습니다.

## 라이선스 (LICENSE)

Copyright (c) 2016-2025 Eugen Rochko (+ [`mastodon authors`](AUTHORS.md))

[LICENSE](LICENSE) 파일에 명시된 대로 GNU Affero General Public License(AGPL) 하에 라이선스가 부여됩니다:

```text
Copyright (c) 2016-2025 Eugen Rochko & other Mastodon contributors

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
