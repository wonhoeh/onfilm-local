# OnFilm Local 진행 계획

## 공개 프로필 초기화와 캐시 혼용 방지 — 2026-10-10

- 증상: 프로필 전체가 비어 ‘불러오는 중’에 머무르지만 더보기는 정상. 이전 갤러리 스크립트가 삭제된 `photoClose` DOM에 접근하면 데이터 fetch 전에 중단되는 호환성 위험 확인. 사용자 브라우저의 실제 오류/캐시는 미확인이라 원인 확정은 아님. 먼저 강력 새로고침으로 구분 요청.
- 공개본의 프로필·필모그래피·플레이어 HTML이 참조하는 JS/CSS에 export UUID 쿼리 버전 추가. 새 HTML이 이전 배포의 동일 URL 스크립트 캐시를 재사용하는 것을 방지. 페이지 이동 URL과 파일명/게시 허용 목록은 그대로 유지.
- export 단위 테스트에서 세 HTML의 버전 포함 및 페이지 링크 유지 검사 추가. `npm test` 56개, 공개본 재생 테스트 통과. Cloudflare 규칙이 쿼리 문자열을 무시하도록 별도 설정된 환경과 실제 사용자 브라우저는 추가 확인 필요.
- 실제 게시/캐시 삭제/사용자 데이터 변경은 하지 않음. 새 앱에서 새 공개본을 생성하고 게시해야 적용.

## 공개 갤러리 확대 화면 통일 — 2026-10-10

- 공개본의 별도 사진 dialog를 제거하고 로컬과 동일한 `gallery-lightbox-overlay`, 이미지·좌우 화살표·닫기 버튼 HTML/CSS로 교체.
- 클릭한 사진 위치에서 열기, 이전/다음 이동, 첫/마지막 화살표 숨김, 키보드 좌우/Esc, 사진·배경 클릭 닫기 지원. 한 장이면 양쪽 화살표 숨김.
- 확대 화면 중 배경 inert, Tab 순환, 닫은 후 선택 사진 버튼으로 포커스 복귀. 사진 파일 및 로컬 편집 화면은 변경하지 않음.
- `npm test` 56개와 macOS `npm run test:published-playback` 통과. 공개 화면에서 세 사진의 첫/중간/마지막 이동, 경계 초과 방지, 키보드·닫기·포커스 복귀 확인. 스크린샷은 UnknownVizError로 미확보.
- 추가 재실행에서 단일 사진 양쪽 화살표 숨김·배경 클릭 닫기도 통과. `./gradlew -PverificationBuild check bootJar` 성공. 새 JAR의 전체 `npm run test:e2e`는 기존 필모그래피 저장 토스트 대기(`persistence.cjs:232`)에서 시간 초과로 실패했으며 전체 회귀 성공을 주장하지 않음.
- 실제 웹 반영에는 앱 재빌드·재시작 후 새 공개본 생성/게시 필요. Cloudflare 자동 재게시하지 않음. Windows는 별도 검증 필요.

## 공개 필모그래피 더보기 — 2026-10-10

- 공개 프로필 FILMOGRAPHY에 로컬과 동일한 ‘더보기 ›’ 링크 추가. 같은 정적 공개본에 `filmography.html` 포함(별도 Pages 프로젝트 불필요).
- 전체 페이지는 로컬 `filmography-view.css`를 재사용해 출연 영상/출연 이력으로 구분하고 건수·빈 상태·실패 후 다시 읽기 제공. 편집·로컬 API·알림 UI는 제외.
- 프로필과 전체 페이지의 공개 카드 렌더링 공유. 영상 없는 작품의 호버 카드는 재생 버튼 없이 연도·역할·배역/참여 정보를 표시하고 클릭/키보드로 상세 정보 표시. 트레일러와 음소거 UI는 기존 공통 코드 재사용.
- 플레이어는 허용된 `from=filmography` 값만 분기해 공개 전체 페이지로 복귀. 프로필 진입은 `index.html`로 복귀하며 외부 URL을 복귀 주소로 사용하지 않음.
- Export 자산 및 게시 파일 허용 목록 확장. 기존 공개본 호환 유지. 새 화면을 적용하려면 새 앱 빌드·재시작 후 공개본을 새로 만들고 게시해야 함.
- 검증: `./gradlew -PverificationBuild check bootJar` 성공, `npm test` 56개 통과. 파일 H2 기반 export 테스트에서 새 HTML/JS/CSS 포함과 편집 기능 제외 확인.
- macOS `npm run test:published-playback` 통과: slug 하위 직접 접근/새로고침, 두 그룹, 영상 없는 호버·상세, 프로필/전체 페이지 각각 영상 복귀, 실패 재시도·빈 상태, 375px 모바일 가로 넘침 없음. 모바일 스크린샷 육안 확인.
- 새 verification JAR을 복사해 실행한 `npm run test:e2e`는 프로필·갤러리·트레일러·플레이어 검사를 통과했으나 `persistence.cjs:668`에서 공개본 작업 버튼 수 기대 4/실제 5로 실패. 앞서 추가된 게시 버튼을 반영하지 않은 기존 assertion이며 전체 E2E 성공으로 기록하지 않음. 후속으로 버튼별 동작 기반 assertion 갱신 필요.
- 실제 Cloudflare 재게시와 Windows 실행은 미검증이며 자동 배포하지 않음.

## 공개본 이미지 최적화 — 2026-10-10

- 공개본 생성 시에만 사진 파생 파일 생성: 프로필 긴 변 960px, 갤러리 1600px, 작품 섬네일 640px. 원본보다 확대하지 않음.
- 불투명 사진은 JPEG 품질 85%, 실제 투명 픽셀이 있는 이미지는 PNG로 유지. 로컬 DB·사진 및 과거 공개본은 변경하지 않음.
- 공개 작품 섬네일 lazy loading·비동기 디코딩 적용. R2 게시 허용 목록에 제한된 JPEG 파일명 추가, 기존 PNG 공개본 호환 유지.
- 적용 방법: 새 앱 빌드/재시작 → 공개본 새로 만들기 → 미리보기·용량 확인 → 게시. 기존 공개본 재게시만으로는 최적화되지 않음.
- 검증: `backend/./gradlew -PverificationBuild check bootJar` 성공(실행 중인 앱 JAR을 건드리지 않는 별도 출력), `desktop/npm test` 54개 통과. 이미지 축소·투명도·재생성 동일성·파일 H2 재시작 후 원본 보존 및 JPEG 게시 MIME 검증.
- `npm run test:published-playback` macOS 통과(실제 공개 화면 자산, 이미지·트레일러·HLS·교차 출처 리다이렉트). 스크린샷 캡처는 UnknownVizError. 이 테스트의 미디어 fixture는 기존 PNG이며 JPEG 생성/게시 계약은 위 백엔드·Node 테스트로 확인.
- `npm run test:e2e`는 기존 기본 앱 JAR로 실행했으며 필모그래피 저장 토스트 대기(`persistence.cjs:232`)에서 시간 초과. 이번 최적화 JAR 전체 GUI 회귀 성공을 의미하지 않음.
- 남은 검증: 새 공개본 실제 사진 육안 품질·용량 비교, Cloudflare 재게시 후 로딩 비교, Windows 빌드/실행. 투명 PNG는 JPEG보다 용량이 클 수 있음. 현재 갤러리는 표시/확대용 파일을 공유하며 별도 작은 썸네일·R2 직접 URL 최적화는 아직 미적용.
- 실제 Cloudflare 게시와 이전 R2 파일 삭제는 수행하지 않음.

## 목표

macOS에서 개발하고 Windows에서 배우 한 명이 사용하는 앱. 편집·저장·인코딩은 로컬, 공개본은 추후 호스팅. 기존 OnFilm 데이터는 이관하지 않는다.

## 진행 현황

- [x] 루트의 인계 문서 확인 및 docs/ 사본 작성 (루트 원본 보존).
- [x] 새 desktop/backend 구조, Gradle Wrapper, npm lockfile 준비.
- [x] H2 파일 DB·Flyway·로컬 접근 보안 결정 기록.
- [x] 프로필 이름·소개 저장 API와 최소 편집 화면.
- [x] Electron 자식 API 시작·준비 확인·실패 처리·종료 구성.
- [x] backend 테스트 4개: 파일 DB 재시작/충돌/제약조건 및 접근 필터.
- [x] Node 테스트 12개: 프로세스 수명·주소 제한·설정 격리.
- [x] 실제 Electron + Java API 저장·재시작 E2E (macOS).
- [ ] 사용자 눈으로 창·종료 확인·편집 확인.
- [ ] Windows 최소 실행 (검증 장비/버전 확인 필요).

## 다음 순서

### Cloudflare 온라인 게시 (2026-10-10)

- [x] 완료된 공개본에 게시 버튼 추가. 대상 공개 주소·Pages 프로젝트 전체 교체·미디어 용량·개인정보 공개·R2 비용/이전 파일 보존을 native 확인창에서 안내한다.
- [x] Electron main에서만 R2 HEAD/PUT 및 Pages Direct Upload 수행. 선택한 공개본 파일 목록·경로·심볼릭 링크·크기·해시·HLS 조각 참조 검사. 키·DB·편집용 원본은 업로드하지 않으며 로컬 공개본을 수정하지 않는다.
- [x] `/<publicSlug>/` 정적 배치, 루트 이동/404, 미디어 경로를 콘텐츠 해시 기반 R2 묶음으로 302 연결. 원본 공개 화면·상대경로·재생 검증 코드는 유지한다. 동일 미디어의 재게시/재시도는 R2 HEAD 검사 후 PUT을 생략한다.
- [x] 업로드 진행률, 중단, 마지막 성공 기록, 배포 결과 확인. production/deploy/success 확인 후 성공 처리. API 응답 유실·재시작은 영수증의 요청 표식/배포 ID로 조회하며 중복 배포를 자동 실행하지 않는다. 명확한 거부/실패는 재시도 가능하다. 기존 R2/Pages 파일을 먼저 삭제하는 처리는 없다.
- [x] 게시 중 백업/복원·공개본 파일 작업·설정 변경·앱 종료 보호. 설정/영수증은 데이터 옆 `.connections`에 보관하며 백업/공개본에 포함하지 않는다.
- [x] backend `./gradlew -PverificationBuild check bootJar` 성공, `npm test` 53개 통과. 경로/링크/누락/변경 거부, R2 동일 파일 재사용·충돌 보호, Pages 업로드 JWT/manifest/해시, 실패·중단·재시작 복구·마지막 성공 보존, 원격 성공 후 로컬 영수증 저장 실패 복구 검증.
- [x] `npm run test:cloudflare-ui` 통과: 실제 임시 파일 H2에서 공개본 생성, 게시 버튼·진행률·작업 중 잠금·응답 유실·창 재생성 후 결과 확인·중복 배포 없음·최근 게시 주소 확인. Cloudflare 전송은 모의 응답, 실제 계정 쓰기 없음. 완료 화면 캡처 검토: `/var/folders/7x/bjzfdyw96s1fsrjdt6k0j63w0000gn/T/onfilm-cloudflare-ui-L7vu7T/publication-complete.png` (설정 화면 캡처는 compositor UnknownVizError).
- [x] `npm run test:published-playback` 통과: 실제 공개 화면 파일과 FFmpeg 생성 HLS를 `/actor_01/` Pages 대역·다른 origin R2 대역으로 제공해 이미지·호버 트레일러·음소거 기본값·영상 조각 재생·프로필 복귀·404 검증. 임시 데이터 `/var/folders/7x/bjzfdyw96s1fsrjdt6k0j63w0000gn/T/onfilm-published-playback-RimVXP`. 화면 캡처는 UnknownVizError, 기능 검사는 통과.
- 전체 회귀 E2E는 첫 실행에서 기존 숨김 창 슬라이더 smooth scroll 대기 타임아웃. 실행 중 검증 JAR 재빌드로 종료 시 클래스 로딩 오류도 관찰하여, 테스트 시작 때 JAR를 임시 폴더에 복사하도록 격리했다. 표시 창 재실행에서는 짧은 저장 알림을 hover 검사 이후 확인해 타임아웃되어 관찰 순서를 앞당겼으나, 최종 재실행도 해당 알림 대기에서 타임아웃했다. **전체 E2E 미통과**이며 게시 전용 UI/분리 재생 테스트 통과와 구분한다. 최종 임시 데이터: `/var/folders/7x/bjzfdyw96s1fsrjdt6k0j63w0000gn/T/onfilm-local-e2e-fklmWb`. 다음 검증에서 기존 저장 알림/GUI 타이밍을 확인한다.
- 미검증/후속: 실제 Cloudflare 운영 게시·DNS/R2 CORS·Windows 패키징/실행, 게시 종료, 원격 사용량, 이전/실패 R2 묶음 정리, 필모그래피 전용 공개 페이지. 미디어 일부 변경 시 새 묶음이 생겨 저장 용량이 누적될 수 있다. 접수 응답도 표식 조회도 없는 불명확한 상태는 자동 재게시하지 않으며 대시보드 확인이 필요하다.
- 사용법/실패 대응/공식 API 근거: `docs/cloudflare-publishing.md`. 실행용 `backend/build` JAR와 사용자 DB/파일/Cloudflare 사이트는 변경하지 않았다.

### 공개 주소 이름 입력 (2026-10-09)

- [x] Cloudflare 연결 화면에 공개 주소 이름 입력과 도메인 기반 완성 주소 미리보기 추가. 영문 소문자·숫자·하이픈(-)·언더바(_) 3~30자, 예약 경로 거부. 화면과 main에서 함께 검증하고 암호화 연결 설정에 저장한다.
- [x] 기존 주소 이름 없는 설정은 키를 보존해 읽으며 R2/Pages 조회 검사는 유지한다. 읽기 시 기존 파일 변경 없음. 다음 저장 때 이름을 추가하며 기존 키 재입력은 필요하지 않다.
- [x] backend `./gradlew -PverificationBuild check bootJar`, Node 44개 통과. 주소 규칙/3·30자 경계·예약어·경로 삽입 거부·기존 설정 무변경 조회·기존 키 유지 저장·영속화 검증.
- [x] macOS 설정 UI E2E 통과: 잘못된 이름 안내, `won-ho_01` 저장·주소 미리보기·창 재실행 유지·초기화 확인. 첫 실행의 캡처 UnknownVizError 후 재실행 통과. 테스트 초기 사용자 데이터 경로를 Electron 준비 전에 지정하도록 보완했다. 가짜 키/암호화 제공자와 임시 데이터만 사용. 캡처: `/var/folders/7x/bjzfdyw96s1fsrjdt6k0j63w0000gn/T/onfilm-cloudflare-ui-SQ5lkH/cloudflare-settings.png`.
- [x] 전체 macOS Electron E2E 통과. 프로필·사진·필모그래피·영상·공개본·백업/복원 회귀 확인. 임시 데이터: `/var/folders/7x/bjzfdyw96s1fsrjdt6k0j63w0000gn/T/onfilm-local-e2e-1wtztM`.
- 범위: 주소 이름 설정·저장·미리보기. 실제 공개 ZIP의 `/username` 배치, 필모그래피 전용 공개 페이지, 게시 후 주소 교체/종료는 다음 단계다. 기존 게시 사이트는 변경하지 않았다. Windows 미검증.

### 공개본 필모그래피 가로 스크롤바 숨김 (2026-10-09)

- 공개본 `public.css`의 `scrollbar-width:thin`을 `none`으로 변경하고 WebKit 스크롤바 숨김을 추가했다. `overflow-x:auto`를 유지해 좌우 화살표·터치/트랙패드 스크롤은 계속 사용할 수 있다.
- 검증 완료: Node 42개, backend `./gradlew -PverificationBuild check bootJar`, macOS 전체 Electron E2E 통과. 카드 좌우 이동·공개본 생성/독립 정적 호스팅 재생·백업/복원 회귀 확인. 임시 테스트 데이터: `/var/folders/7x/bjzfdyw96s1fsrjdt6k0j63w0000gn/T/onfilm-local-e2e-9seBjL`.
- 기존 ZIP/Cloudflare 배포본은 자동으로 바뀌지 않는다. 앱 종료 후 새 JAR 빌드 → 앱 실행 → 새 공개본 생성 → 새 ZIP 재배포가 필요하다. Windows 및 실제 배포 브라우저의 OS별 스크롤바 표시는 미검증.

### Cloudflare 연결 설정 (2026-10-09)

- [x] 공개본 관리에서 연결 화면 진입. Account ID·버킷·Pages 프로젝트·공개 주소·키 입력, 저장된 키 숨김, 빈 입력 시 키 유지, 계정 변경 시 재입력, 로컬 설정 삭제.
- [x] Electron main safeStorage 암호화 저장. 설정은 앱 데이터의 형제 `.connections` 폴더에 보관해 공개본·데이터 백업에서 제외한다. 암호화 불가 시 평문 저장을 하지 않는다. 저장소의 키 보관 폴더는 내용을 읽지 않고 Git에서 제외했다.
- [x] Cloudflare 화면 main-frame IPC 검증. 계정 ID로 고정된 R2/API 호스트에만 인증 요청. R2 MaxKeys=1/Pages 프로젝트 조회, 부분 실패·인증 실패·시간 초과 안내. 업로드/쓰기 권한까지 검증했다고 표시하지 않는다.
- [x] backend `./gradlew -PverificationBuild check bootJar`, Node 42개 통과. 암호화 파일 재조회, 키 비노출, 잘못된 설정/암호화 실패 시 보존, IPC 거부, 읽기 전용 연결 요청·부분 실패·취소를 검증했다.
- [x] macOS `npm run test:cloudflare-ui` 통과. 설정 저장·키 입력란 비움·부분 실패 표시·편집 후 재검증 제한·창 재생성 후 유지·삭제 취소/실행·다른 화면의 bridge 미노출 확인. 가짜 키·암호화 제공자·원격 응답 및 임시 H2만 사용했다. 캡처: `/var/folders/7x/bjzfdyw96s1fsrjdt6k0j63w0000gn/T/onfilm-cloudflare-ui-7Z4ljl/cloudflare-settings.png`.
- [x] 전체 macOS `npm run test:e2e` 통과. 프로필·갤러리·필모그래피·트레일러/원본 재생·공개본 생성/ZIP·백업/복원 회귀 확인. 임시 데이터: `/var/folders/7x/bjzfdyw96s1fsrjdt6k0j63w0000gn/T/onfilm-local-e2e-RUSGIW`. 이전 기록의 슬라이더 타임아웃도 이번 실행에서는 재현되지 않았다.
- 미검증: 실제 Cloudflare 키/네트워크·쓰기 권한·macOS Keychain/Windows DPAPI 저장과 재실행, Windows 설치 파일. 자동 게시·R2 미디어 이동·사용량·공개본 `/username` 및 필모그래피 전용 페이지는 후속 작업.
- SDK는 런타임 의존성 `@aws-sdk/client-s3`로 고정했다. npm audit의 moderate 8개는 기존 electron-builder 개발 의존성 체인(sprintf-js 등)으로, 이번 범위에서 패키징 도구 강제 변경은 하지 않았다.
- 사용 절차와 보안/검증 범위: `docs/cloudflare-connection.md`. 기존 사용자 데이터와 실행용 JAR는 변경하지 않았다.

### 영상 플레이어 진입 화면 복귀 (2026-10-08)

- 프로필에서 영상 진입 → 왼쪽 상단 `← 제목` 클릭 시 프로필 복귀. 필모그래피 더보기의 카드/호버 팝업에서 진입 → 필모그래피 더보기 복귀.
- 로컬 플레이어의 `from=filmography`만 허용해 고정된 내부 경로로 이동한다. 임의 URL은 반환 주소로 사용하지 않으며 값이 없거나 잘못됐으면 프로필로 복귀한다. 공개본은 기존 `index.html` 복귀를 유지한다.
- 검증: backend verificationBuild check/bootJar, Node 35개 통과. 실제 플레이어 스크립트를 DOM 대역에서 실행해 프로필/필모그래피 복귀, 클릭/Enter, 임의 주소 거부, 공개본 기존 동작을 검사했다. 재생 실패 상태에서도 돌아가기가 동작한다.
- 전체 macOS Electron E2E는 기존 슬라이더 스크롤 대기에서 타임아웃되어 이번 실행은 미통과(중간 실행에서 화면 캡처 UnknownVizError도 발생). 새 실제 영상 복귀 E2E 케이스는 추가했으나 해당 단계까지 도달하지 못했다. 테스트용 렌더링/동작 줄이기 우회는 최종 코드에서 제거했다. 실패 테스트 데이터: `/var/folders/7x/bjzfdyw96s1fsrjdt6k0j63w0000gn/T/onfilm-local-e2e-ubY1h3`.
- 다음 확인: 전경 GUI 환경에서 E2E 재실행, Windows 새 빌드에서 카드·호버 재생 후 두 경로 복귀 수동 확인(미검증). 기존 사용자 데이터와 실행용 JAR는 변경하지 않았다.

### 1. 전체 필모그래피 로컬 페이지 (2026-10-08)

- 메인 FILMOGRAPHY 옆 더보기 → `/filmography.html`. 메인 카드 구성은 유지하고 전용 페이지에서 출연 영상/출연 이력을 분리한다. 같은 API와 저장 데이터를 사용하며 추가 DB/마이그레이션은 없다.
- 원본 영상이 연결된 작품은 출연 영상(인코딩 전도 포함), 원본 없는 작품은 출연 이력. 트레일러만 연결돼도 출연 이력으로 분류하며 기존 트레일러 호버/음소거는 유지한다.
- 영상 없는 전용 페이지 카드는 동일한 확대 팝업에 연도·역할·배역 구분·배역명과 장르 등을 표시하며 원본 재생 버튼은 숨긴다. 클릭/Enter/Space로 전체 참여 정보 확인. 이미지 없는 작품은 기본 이미지, 빈 그룹 안내와 API 오류 재시도 제공.
- 키보드 포커스에 따른 자동 스크롤 후에도 팝업이 열리도록 공통 미리보기 포커스 처리를 보완했다.
- 메인 슬라이더는 목록 반영 직후 화살표 상태를 계산하도록 보완했다. E2E의 키보드 검증은 실제 창을 표시한 상태에서 수행한다.
- 검증: backend `./gradlew -PverificationBuild check bootJar`, desktop `npm test` 31개, macOS 전체 Electron E2E 통과. 전용 페이지 분류/재생 버튼 전환/키보드 상세/빈 그룹/읽기 실패 재시도/프로필 복귀, 기존 슬라이더 3·4·5편, 영상·공개본·백업/복원 회귀 확인. 캡처와 테스트 데이터: `/var/folders/7x/bjzfdyw96s1fsrjdt6k0j63w0000gn/T/onfilm-local-e2e-8zBfVK`. 기존 사용자 데이터와 실행용 JAR는 변경하지 않았다.
- 다음 단계: 공개본에도 전용 페이지 포함 및 페이지 간 상대 경로 연결. Cloudflare Pages/R2·도메인·게시/종료·사용량 화면은 아직 미구현. Windows 새 빌드의 페이지 이동/호버/키보드/트레일러는 미검증.

### 장르 3개·인코딩 진행률·알림함 (2026-10-07 검증 완료)

- 장르 최대 3개를 UI와 서버에서 검증. 기존 초과 데이터는 자동 삭제하지 않으며 저장 시 사용자가 정리하도록 안내한다. 호버 메타데이터 한 줄 넘침은 말줄임 처리한다.
- V13으로 작업 진행률과 완료 알림 테이블 추가. FFprobe 길이와 FFmpeg out_time_us로 진행률을 산출하고 증가할 때만 DB에 반영한다. 변환/결과 검증 중에는 최대 99%, 완료 상태와 알림을 같은 트랜잭션으로 저장하며 100% 확정. 실패/중단은 완료 알림을 생성하지 않고 재시도 시 0%부터 시작한다.
- 원본/트레일러 진행 바와 % 표시. 로컬 페이지 공통 종 아이콘, 읽지 않은 개수, 최신순 최근 100개, 모두 읽음, Escape/바깥 클릭 닫기를 제공한다. 새 완료는 상단 슬라이드 알림, 알림/읽음 상태는 DB에 유지. 최초 진입 시 과거 알림을 한꺼번에 띄우지 않는다. 공개본에는 개인 알림 코드/DB를 포함하지 않는다. OS 데스크톱 알림은 이번 범위가 아니다.
- 검증: backend check bootJar(verificationBuild), Node 31개, macOS Electron 전체 E2E 통과. 실 FFmpeg 완료/100%, 진행률 계산 단위 테스트, 중간 42% UI 재현, 상단 알림 위치, 최신순/배지/읽음 및 파일 H2 재시작 영속화 확인. 최종 캡처/임시 데이터: `/var/folders/7x/bjzfdyw96s1fsrjdt6k0j63w0000gn/T/onfilm-local-e2e-er6gJS`.
- 다음 확인: Windows 새 빌드에서 긴 영상 실제 진행률·앱 최소화 후 알림함·애니메이션 수동 확인(Windows 미검증). 기존 사용자 데이터/실행용 JAR는 변경하지 않았다.

### 공개본·백업 화면 정리 (2026-10-06)

- 전용 공통 스타일 `local-tools.css`로 두 페이지를 기존 다크/보라색 톤에 맞춰 재구성. 공개본 생성 → 미리보기 → ZIP 저장 순서를 안내하고, 생성 영역·결과 목록·앱 저장 공간을 분리했다. 결과는 날짜/파일 수/용량/버튼 카드, 사용량은 항목별 용량 카드로 표시한다.
- 백업/복원은 별도 카드와 아이콘으로 구분하고 완료 문구와 경로를 분리했다. 온라인 자동 게시 아님, 개인정보 공개 동의, 복원 시 데이터 교체, 암호화되지 않은 개인 백업, 작업 중 종료 금지 등 중요한 안내는 유지하고 세부 설명/경로는 접기 영역으로 정리했다.
- 기존 API/IPC/백업 범위/복원 확인 절차는 유지. 백엔드 `./gradlew -PverificationBuild check bootJar`, desktop `npm test`(31개), macOS Electron E2E 전체 통과. 실제 UI 버튼으로 백업/취소/복원과 결과 경로 표시, 공개본 작업 버튼/사용량 카드/430px 가로 넘침 여부를 검사했다. 테스트에서만 최소 창 크기 제한을 낮춰 반응형 확인(앱 최소 크기 변경 없음).
- 캡처 및 임시 데이터: `/var/folders/7x/bjzfdyw96s1fsrjdt6k0j63w0000gn/T/onfilm-local-e2e-mQ0ZgN`. 공개본 데스크톱/좁은 화면 및 백업 화면 캡처를 확인했다. 기존 사용자 데이터와 실행용 JAR는 변경하지 않았다. 다음 확인은 Windows 새 빌드에서 레이아웃·긴 경로 줄바꿈·백업/복원 상태 수동 확인(Windows 미검증).

### 갤러리 드래그 순서 변경 (2026-10-06)

- 사진 영역을 드래그해 대상 사진 위치로 이동. 앞쪽 이동은 대상 앞, 뒤쪽 이동은 대상 뒤로 삽입하며 위치 표시선과 드래그 중 흐림/커서를 제공한다. 기존 앞/뒤 아이콘 버튼은 키보드 사용을 위해 유지한다.
- 임시 업로드와 기존 사진 모두 지원. 사진 객체 자체를 이동하여 회전/파일 연결을 유지하고 최종 저장 전에는 DB를 변경하지 않는다. 저장/업로드 중에는 드래그 금지. 같은 자리 드롭/취소/창 이탈은 순서를 바꾸지 않으며 외부 파일 드롭과 내부 정렬을 구분한다.
- 검증: backend `./gradlew -PverificationBuild check bootJar`, 최종 CSS 반영 `bootJar`, desktop `npm test`(31개), macOS Electron E2E 전체 통과. 네 장의 마지막→처음/처음→마지막 이동, 같은 자리, 취소, 외부 파일 무시, 저장 전 DB 순서 유지 및 저장/회전 회귀 확인. E2E는 DragEvent로 드래그를 재현했다. 임시 데이터: `/var/folders/7x/bjzfdyw96s1fsrjdt6k0j63w0000gn/T/onfilm-local-e2e-8ZYw3Q`.
- 다음 확인: Windows 새 빌드에서 실제 마우스 드래그와 여러 줄 배치/스크롤, 취소·저장 후 순서 수동 확인(미검증). 기존 사용자 파일과 실행용 JAR는 변경하지 않았다.

### 필모그래피 카드 배역명 표시 (2026-10-06)

- 로컬 프로필과 공개본 카드에 배우 역할의 배역명을 함께 표시한다: `2026 · 배우 · 민수`. 배역명이 비어 있으면 생략하고 감독·작가는 기존 표시 유지. 여러 역할이면 배우 바로 뒤에 배역명을 표시한다. 텍스트로 렌더링하며 상세 안내에서 배역명이 중복되지 않도록 조정했다.
- 검증: `./gradlew -PverificationBuild check bootJar`, `npm test`(31개), macOS Electron E2E 전체 통과. 실제 편집/저장 후 카드 문구와 내보낸 공개본의 카드 메타데이터를 검사했다. 임시 데이터: `/var/folders/7x/bjzfdyw96s1fsrjdt6k0j63w0000gn/T/onfilm-local-e2e-UAVW4M`.
- 다음 확인: Windows 새 빌드에서 표시 확인(미검증). 기존 공개본은 다시 내보내야 반영된다. 기존 사용자 DB와 실행용 JAR는 변경하지 않았다.

### 트레일러·확장 미리보기 카드 (2026-10-06)

- 음소거 아이콘 표시 수정: SVG의 `.hidden` 프로퍼티는 HTML 요소처럼 속성에 반영되지 않아 소리만 전환되고 아이콘은 고정됐다. `toggleAttribute('hidden', ...)` 및 `volumechange` 동기화로 수정. 기존 E2E는 음소거 상태만 검사했던 한계가 있어, 두 SVG의 실제 계산된 display를 무음 → 소리 켜짐 → 무음 순서로 검증하도록 보강했다.
- 수정 후 검증: `./gradlew -PverificationBuild check bootJar`, `npm test`(31개), macOS Electron E2E 전체 통과. 캡처/임시 데이터: `/var/folders/7x/bjzfdyw96s1fsrjdt6k0j63w0000gn/T/onfilm-local-e2e-cNCpUV`. Windows에서는 새 빌드 후 아이콘 전환 확인 필요. 기존 공개본은 다시 내보내야 수정된 JS가 포함된다.
- 기존 OnFilm `static/js/actor-detail.js`의 movie-popup 마크업/확대 곡선/원형 음소거 버튼 및 두 SVG path를 재사용. 단순 카드 확대가 아닌 별도 fixed 팝업. 좋아요는 로컬 기능이 없으므로 추가하지 않음.
- V12: 원본과 독립적인 트레일러 연결 및 임시 트레일러 필드. 파일 복사/인코딩 파이프라인 재사용, 작품 저장 시 섬네일·원본·트레일러 함께 확정. 교체/연결 해제 시 기존 원본/파일 보존.
- 편집은 아이콘+선택 버튼, 선택 후 아이콘 숨김, 교체/연결 해제/인코딩/보기 버튼. 트레일러 없는 작품도 저장 가능.
- 팝업은 무음 시작, 재생이 확인되면 섬네일을 감춤. 없거나 변환 중/실패 시 섬네일 유지. 마우스 이탈/스크롤/창 비활성화/페이지 종료 시 HLS와 요청 정리, 늦은 응답 무시. 클릭은 원본 재생, 음소거 클릭은 화면 이동 차단. 키보드 focus/Escape 및 모션 감소 지원.
- 공개본에 트레일러 HLS/팝업 JS 포함, 서버 없이도 동일한 미리보기. 연결된 트레일러 변환 미완료 시 내보내기 실패로 불완전한 공개본 방지. 팝업이 화면 밖으로 잘리지 않도록 위치 보정.
- 검증 완료: `./gradlew -PverificationBuild check bootJar`, `npm test`(31개), macOS Electron `npm run test:e2e` 전체 통과. 파일 H2 원본/트레일러 분리·실패 롤백·재시작·연결 해제, 실제 FFmpeg 트레일러 변환·무음 재생·SVG 버튼 토글·빠른 재진입·실패 시 섬네일 유지·이탈 정리·공개본 재생을 확인했다. 갤러리·백업/복원 회귀 테스트도 통과했다.
- E2E 임시 데이터/화면 캡처: `/var/folders/7x/bjzfdyw96s1fsrjdt6k0j63w0000gn/T/onfilm-local-e2e-60N7zk`. 검증 전용 JAR와 임시 DB를 사용했으며 기존 사용자 데이터와 실행용 JAR는 변경하지 않았다. 다음 작업은 Windows 새 빌드에서 팝업 위치·트레일러 재생·음소거·저장/재시작 수동 검증이다(Windows 미검증).

### 갤러리 임시 편집·회전·저장 (2026-10-06)

- 드롭 아이콘+파일 선택 버튼으로 업로드 영역 통일. 사진 조작은 앞으로/뒤로/90도 회전/삭제 SVG 아이콘으로 변경하고 title/접근성 라벨 제공. 하단은 취소/저장, 요청한 상시 안내 문구 제거. 오류 시에만 다시 읽기 표시.
- V11 임시 이미지 테이블 추가. 업로드는 정규화된 임시 이미지로 보관하며 추가·순서 변경·회전·삭제는 최종 저장 전 프로필에 반영하지 않는다. 취소하면 기존 갤러리 유지.
- 회전은 시계 방향 90도 미리보기, 저장 시 PNG 픽셀에 적용. 원본 파일은 변경하지 않는다. 최종 저장은 version 검사/순서/이미지 회전/추가/삭제/사용한 임시 기록 소비를 한 트랜잭션으로 처리.
- 업로드 실패 시 이미 준비한 사진 유지·재선택 가능. 저장 결과 불명확 시 중복 제출 차단 및 다시 읽기 제공. 취소한 임시 사진은 자동 삭제하지 않으며 선택 정리 UI는 후속 작업.
- 파일 H2 테스트: 임시 데이터 재시작 유지, 저장 도중 실패 롤백, stale/중복 입력 거부, 회전한 이미지 크기·픽셀·4회 회전 복원, 저장 후 재시작/삭제 확인.
- 검증 완료: backend verification check/bootJar 통과(테스트 up-to-date), Node 31개 통과. macOS Electron 전체 회귀 재실행 통과(`/var/folders/7x/bjzfdyw96s1fsrjdt6k0j63w0000gn/T/onfilm-local-e2e-2T5spl`). 색상 패턴으로 회전 미리보기 캡처 확인, 추가·회전·정렬 후 저장/재시작, 회전·삭제 후 취소 시 기존 데이터 유지, 저장 응답 유실 후 중복 차단/재조회 복구 확인. Windows/OS 파일 드롭은 새 빌드 수동 검증 필요. 사용자 DB/미디어/일반 실행 JAR 변경 없음.

### 프로필 필모그래피 좌우 이동 (2026-10-05)

- 기존 OnFilm `actor-detail.js`/CSS 참고. 로컬에서 hidden만 해제해도 원본 CSS display:none이 남아 화살표가 보이지 않던 문제 수정.
- 3편 이하는 숨김, 4편 이상은 이동 가능한 방향의 기존 ‹/› 화살표 표시. 첫 위치는 오른쪽, 마지막 위치는 왼쪽 표시. 클릭 시 카드 너비+gap만큼 한 작품씩 이동.
- 원본 투명 배경/글자/hover 스타일 유지, 좁은 창에서는 화살표가 화면 밖으로 나가지 않도록 위치 보정. 모션 감소 설정 지원.
- Electron 테스트에 3/4/5편 표시 조건 및 양방향 끝까지 이동 검사 추가. Windows 새 빌드 후 마우스/창 크기 수동 검증 필요.
- 검증: backend verification `check bootJar`, Node 31개, macOS Electron 전체 회귀 통과. 임시 결과 `/var/folders/7x/bjzfdyw96s1fsrjdt6k0j63w0000gn/T/onfilm-local-e2e-Xw5sn8`. 사용자 DB·일반 실행 JAR 변경 없음.

### 필모그래피 업로드 영역 간소화 (2026-10-05)

- 드롭 아이콘은 파일이 없을 때만 표시. 섬네일/영상 선택 성공 시 숨기고 삭제/연결 해제 시 다시 표시. 추후 트레일러 업로드도 같은 규칙을 적용한다(현재 트레일러 미구현).
- 아이콘 표시 조건 변경 검증: backend verification check/bootJar 및 Node 31개 통과. Electron 선택/삭제/연결 해제 아이콘 검사 통과 후 캡처 단계 UnknownVizError 발생하여 전체 회귀 재실행.
- 재실행 전체 회귀 통과(macOS): `/var/folders/7x/bjzfdyw96s1fsrjdt6k0j63w0000gn/T/onfilm-local-e2e-xoTF6h`. Windows 새 빌드 검증은 남음.
- 작품 삭제 확인은 `이 작품을 삭제할까요?`로 축약. 삭제는 기존처럼 최종 저장 시 확정.
- 섬네일/영상의 상시 안내 문단을 제거하고 드롭 아이콘과 파일 선택 버튼 배치. SVG 접근성 라벨 제공, 기존 파일 검증·드롭 동작·오류 안내 유지.
- 섬네일 교체/삭제 및 영상 교체/연결 해제/인코딩/보기 버튼을 각 한 줄로 배치. 좁은 영역에서는 버튼 줄 내부 가로 스크롤을 허용하며 기존 조건에 따라 영상 보기 버튼 표시.
- 참여 역할을 배우·감독·작가 한 줄로 배치. 선택 후 미리보기·파일명·인코딩 상태 유지.
- Windows 새 빌드 후 화면과 OS 파일 드롭 수동 확인 필요.
- 검증: `./gradlew -PverificationBuild check bootJar`, Node 31개, macOS Electron 전체 회귀 통과. 안내 문단 제거/아이콘/버튼·역할의 동일 행 배치 검사 및 화면 캡처 확인. 임시 결과: `/var/folders/7x/bjzfdyw96s1fsrjdt6k0j63w0000gn/T/onfilm-local-e2e-fmew3L`. 사용자 데이터·일반 실행 JAR 변경 없음.

### 필모그래피 저장 피드백 개선 (2026-10-05)

- 저장 성공 응답 확인 후 dirty/busy를 모두 해제하고 프로필로 이동. 미저장 편집/전송 중 이탈 확인은 유지한다.
- 성공 시에만 일회성 상단 `저장되었습니다.` 알림을 표시하고 약 2.8초 내 위로 사라지게 한다. 알림은 클릭/포커스를 가로채지 않고, role=status 및 모션 감소 설정을 지원한다.
- 필모그래피 하단 취소/저장 버튼의 텍스트를 가로·세로 가운데 정렬.
- Electron 회귀에 미저장 이탈 보호, 성공 저장 시 이탈 확인 0회, 완료 알림 표시/제거, 버튼 정렬 검사를 추가. Windows는 새 빌드 후 수동 확인 필요.
- 검증: `./gradlew -PverificationBuild check bootJar`, `npm test` 31개 및 macOS Electron 전체 E2E 통과. 임시 결과: `/var/folders/7x/bjzfdyw96s1fsrjdt6k0j63w0000gn/T/onfilm-local-e2e-DGr3xu`. 일반 실행 JAR/사용자 데이터 변경 없음.

### 작품 정보·섬네일·영상 통합 등록 (2026-10-05)

- [x] 신규 작품도 정보 입력 중 섬네일·원본 영상을 선택할 수 있으며, 기존 작품의 수정 중에도 파일 선택 가능. 파일 응답으로 입력 중인 정보/장르를 덮어쓰지 않음.
- [x] V10 임시 미디어 테이블 추가. 선택한 영상은 앱 폴더로 안전하게 복사하고 섬네일은 정규화하여 임시 보관. 최종 저장 전 기존 작품/미디어 연결은 유지.
- [x] 저장 전 임시 영상으로 인코딩 시작·상태 확인·실패 재시도. 최종 저장에서 작품 정보·섬네일·영상 연결 및 임시 기록 소비를 하나의 JDBC 트랜잭션으로 확정. 저장 후 완료 영상 재생 가능.
- [x] 오래된 version/중복 저장 차단. 저장 중 뒤쪽 작품에서 실패해도 앞쪽 작품의 파일 연결까지 롤백. 파일 전송 실패 시 임시 상태 재조회, 상태 확인도 실패하면 최종 저장 제한.
- [x] 파일 H2 재시작 후 임시 자료 유지·최종 저장·원자적 롤백·기존 미디어 보존 테스트 추가. 기존 V1~V9와 사용자 데이터/일반 실행 JAR는 변경하지 않음.
- 주의: 파일 선택은 디스크 임시 보관, 최종 저장은 작품에 연결하는 확정 작업이다. 편집 취소/다시 읽기 시 폼은 폐기되지만 임시 복사본은 자동 삭제하지 않는다. 미저장 폼 복구 및 임시 자료 선택 정리 UI는 후속 과제다.
- 기존 버전은 사용자 보고 기준 Windows 실행·영상·재실행 유지·ZIP/백업 복원 정상. 이번 통합 등록 변경은 Windows 새 빌드/런타임 반영 후 재검증 필요.
- 검증: backend `./gradlew -PverificationBuild check bootJar`, desktop `npm test` 31개, macOS Electron 전체 회귀 통과. 신규 작품 저장 전 파일 선택/인코딩 실패 재시도, 실제 FFmpeg 인코딩 완료 후 최종 저장/재생, 기존 갤러리·공개본·백업/복원 확인. 임시 결과: `/var/folders/7x/bjzfdyw96s1fsrjdt6k0j63w0000gn/T/onfilm-local-e2e-tnPv3d`.

### Windows 런타임 확보·준비 자동화 (2026-10-04)

- [x] Temurin JRE 21.0.12.1+1 및 Gyan FFmpeg essentials 9.0.2 다운로드, 공급자 고정 SHA-256 검증 후 staging 추출. runtime/windows-x64에 실제 API/JRE/FFmpeg 준비(362개 파일, 약 490MiB).
- [x] 원래 라이선스/고지 파일 보존, 출처·배포 해시·파일별 해시 manifest 생성. 기존 runtime 덮어쓰기 금지, ZIP 링크/경로 탈출/예약 이름/용량 제한. prepare 실패 파일과 원본 ZIP은 보존.
- [x] `check:windows-runtime` 실제 번들 362개 파일 통과. file 도구로 java.exe/ffmpeg.exe Windows x86-64 형식 확인(실행 검증 아님).
- [x] 압축 라이브러리 검토 중 extract-zip 취약점 발견 후 제거, yauzl 3.4.0 고정. npm audit 0건. Node 31개 및 backend verification check/bootJar 통과(up-to-date).
- [x] macOS Electron 전체 회귀 통과: 편집/영상/공개본/휴지통 대역/파일 H2 백업·복원. 임시 결과 `/var/folders/7x/bjzfdyw96s1fsrjdt6k0j63w0000gn/T/onfilm-local-e2e-1n0Ylc`.
- 사용자 DB/미디어/일반 실행 JAR는 변경하지 않음. 다운로드 원본은 runtime/prepare-windows-YMv2rV에 약 156MiB 추가 보관.
- 남은 일: Windows 장비의 pack/dist와 실제 인코딩·백업/종료/설치·제거 검증. 제3자 전달 전 GPL 대응 소스·빌드 자료 등 재배포 검토 필요. 고지 포함만으로 완료했다고 보지 않는다. [상세](windows-packaging.md).

### Windows 설치 파일 생성 설정 (2026-10-04)

- [x] electron-builder 26.15.3 고정/lockfile 갱신. x64 NSIS 사용자별 설치·바로가기·앱 데이터 보존·자동 실행 금지·업로드 금지 설정.
- [x] 코드 포함 범위 제한, runtime 별도 동봉, Windows 빌드 훅. Java 21/x64 선언·필수 파일·고지·파일별 SHA-256/누락·링크/DB/환경 파일 검사.
- [x] 설정 스키마 검사 통과. 런타임 미준비 시 `check:windows-runtime` 실패 확인. npm 설치 audit 0건, 하위 의존성 deprecated 경고는 남음.
- [x] `./gradlew -PverificationBuild check bootJar` 통과(up-to-date), Node 28개 통과, macOS Electron 전체 E2E 통과. 임시 결과: `/var/folders/7x/bjzfdyw96s1fsrjdt6k0j63w0000gn/T/onfilm-local-e2e-gP11CQ`. 사용자 데이터/일반 실행 JAR는 변경하지 않음.
- 실제 설치 파일은 아직 없음: `runtime/windows-x64`가 비어 있고 Windows 장비 실행도 미검증. 다음은 배포 바이너리 출처·라이선스 확인/확보·manifest 생성 및 Windows pack/dist 검증. 상세: [Windows 패키징](windows-packaging.md).

### Windows 동봉 런타임 실행 기반 (2026-10-04)

- [x] 개발 실행과 설치형 실행을 분리. 설치형은 resources/runtime의 Java/API JAR/FFmpeg/ffprobe 절대 경로를 사용하고 개발용 실행 파일 override로 대체하지 않음.
- [x] 구성 파일 누락 시 사용자 데이터 생성/서버 실행 전 재설치 안내. 사용자 DB·미디어 및 일반 JAR는 변경하지 않음.
- [x] 한글·공백 경로, 누락된 ffprobe, 개발 경로 override 무시, 비지원 OS/CPU 거부 테스트 추가. 테스트용 가짜 exe는 실행하지 않음.
- [x] `./gradlew -PverificationBuild check bootJar` 통과(백엔드 변경 없음, up-to-date), Node 26개 통과, macOS Electron 전체 E2E 통과. 프로필/갤러리/영상 인코딩·재생/공개본/선택 정리/파일 H2 백업·복원 확인. 임시 결과: `/var/folders/7x/bjzfdyw96s1fsrjdt6k0j63w0000gn/T/onfilm-local-e2e-Yp3vob`.
- 미구현/미검증: 실제 Windows 실행, 실제 런타임 동봉, 설치 파일 생성/코드 서명, Windows 프로세스 정상 종료. 이번 단계는 설치 파일 완성이 아님.
- 다음: Windows x64 배포 바이너리 확정 및 설치 패키징. [상세 준비 계획](windows-packaging.md).

### 저장 공간 확인·완료 공개본 선택 정리 (2026-09-30)

- [x] 공개본 화면에서 DB·미디어·공개본/ZIP 캐시/부분 파일의 논리적 크기 표시. 링크는 따라가지 않고 일부 제외 안내. 외부 백업·복원 전 보관 폴더·외부 ZIP·휴지통은 합산 제외.
- [x] 완료 공개본 ID/실제 경로/manifest 검사 → 사용자 확인 → 경로/파일 재검사 → OS 휴지통 이동. 알 수 없는 파일·심볼릭 링크 포함 시 거부. 영구 삭제 fallback 없음.
- [x] DB·원본 영상·백업·외부 ZIP·게시된 사이트는 정리 대상에서 제외. 미완료 공개본/미디어 자동 정리도 하지 않음.
- [x] 2026-10-04 재개 후 `./gradlew -PverificationBuild check bootJar` 통과(기존 테스트 결과 up-to-date), Node 25개 통과, macOS Electron 전체 E2E 통과. 사용량 표시·정리 취소·선택 공개본 이동·외부 ZIP 보존, 기존 편집/영상/정적 공개본/파일 H2 백업·복원 회귀 확인.
- 이전 E2E의 `/var`와 `/private/var` 경로 비교 실패는 테스트 대역에서 realpath 비교로 보정. 재실행 결과 종료 코드 0. 임시 결과: `/var/folders/7x/bjzfdyw96s1fsrjdt6k0j63w0000gn/T/onfilm-local-e2e-HzzEvV`.
- 실제 사용자 데이터는 정리하지 않고 임시 테스트 폴더만 사용. 일반 실행 JAR는 덮어쓰지 않았으므로 앱 종료 후 backend에서 `./gradlew bootJar`로 갱신하고 desktop에서 `npm start`로 실행한다.
- Windows 실제 휴지통 동작·OS 확인 창 수동 확인·대용량 파일 탐색/디스크 고갈은 미검증. OS 휴지통 이동 테스트는 임시 폴더 rename 대역으로 검증한다.
- 다음: Windows 실행/패키징 준비와 검증. 호스팅 선택·자동 게시, 미완료 파일 정리는 별도 단계.

### 로컬 데이터 백업·복원 (2026-09-30)

- [x] 프로필 메뉴의 백업 화면, OS 폴더 선택/복원 확인, main-frame 제한 IPC.
- [x] 인코딩 유휴 상태 확인 → 소유 API 정상 종료 → DB/미디어 폴더 백업 → 서버 재시작. 원본/사용자 데이터 삭제 없음.
- [x] 크기/SHA-256·허용 경로·심볼릭 링크·완료 목록 검사. 복원 staging/이전 데이터 보관, 시작 실패 rollback, 중단 복구 기록 시 다음 앱 시작 차단.
- [x] `./gradlew -PverificationBuild check bootJar`, Node 22개, macOS Electron 전체 E2E 통과. 실제 소유 API 종료/재시작·파일 H2/미디어 백업·프로필 변경 후 복원·사진/갤러리 유지·이전 데이터 보관 확인. OS 폴더/확인 dialog만 대역 사용. 백업 화면 캡처 확인.
- [x] Node에서 손상/경로 탈출/심볼릭 링크/혼합 사용자 폴더 거부, 시작 실패 rollback, 복원 중단 기록 시 앱 시작 차단, 인코딩 유휴 검사 실패·취소·중복 요청·강제 종료 거부 검증. 최초 sandbox 포트 바인딩 EPERM은 권한 승인 후 재실행해 통과.
- 사용자 DB/원본 및 일반 실행 JAR는 변경하지 않음. 앱 종료 후 일반 bootJar로 실행본 갱신 필요.
- Windows·대용량/디스크 고갈·OS 실제 폴더 선택·강제 종료/전원 차단·버전 간 호환·자동 중단 복구 UI는 미검증/미구현. 세부 사항: `decisions/011-local-backup-restore.md`.
- 다음: 실제 Windows 실행 검증 또는 보관 파일 용량 표시·선택 정리. 정리는 사용자 확인 없이 수행하지 않는다.

### Contact 이메일 전용으로 단순화 (2026-09-30)

- [x] 전화번호 입력/표시·공개 체크박스·`· 공개/비공개` 문구 제거. 입력된 이메일은 표시, 공백/빈 값이면 로컬/공개 화면 CONTACT ME 전체 숨김.
- [x] API 연락처도 email만 제공. 기존 전화번호/공개 플래그 DB 값은 삭제하지 않고 사용 중단. 새 공개본은 이메일 존재 여부만 확인하며 전화번호는 항상 제외.
- [x] 기존 공개본·ZIP은 자동 변경하지 않음. 이전 전화번호를 내리려면 새 공개본 생성/교체 필요. 과거 전화번호 표시/공개 선택 단계 기록은 이 정책으로 대체.
- [x] 백엔드 `check bootJar`(verificationBuild), Node 15개 및 macOS Electron 전체 회귀 검증 통과. 이메일만 응답/내보내기, 기존 전화번호 보존·노출 차단, 이메일 삭제/재시작 유지, 로컬/정적 공개 화면의 빈 CONTACT ME 숨김 확인. V8→V9 기존 프로필 보존 검증 유지.
- Windows 미검증. 사용자 DB/일반 실행 JAR 변경 없음. 앱 종료 후 일반 bootJar로 실행본 갱신 필요.

### 연락처 전화번호 표시 (2026-09-30)

- [x] 010으로 시작하는 11자리 번호를 프로필/새 공개본에서 `010-1234-5678`로 표시. 저장값·편집 입력은 원문 유지, 공백/하이픈이 있는 동일 번호도 같은 표시 적용.
- [x] 국제번호/다른 지역번호/알 수 없는 길이는 임의로 변환하지 않음. 공개 동의 조건 유지, 이전 공개본 자동 변경 없음.
- [x] 백엔드 `check bootJar`(verificationBuild), Node 15개, macOS Electron 전체 E2E 통과. 원문 보존·국제번호 유지·공개 JSON 변환, 로컬 프로필과 독립 정적 공개 화면의 하이픈 표시 확인. Windows 미검증. 일반 실행 JAR/사용자 DB 변경 없음.

### Contact 연락처와 공개 선택 (2026-09-30)

- [x] V9 마이그레이션으로 이메일·전화번호·각각의 공개 여부 추가. 기존 프로필/사진 보존, 기본 비공개.
- [x] 프로필 편집에서 선택 입력/공개 체크 후 저장. 로컬 조회에는 공개 여부와 함께 표시하며, 공개본은 공개 선택한 값만 JSON/화면/ZIP에 포함.
- [x] 길이·형식·빈 값 공개 검사, version 충돌/트랜잭션 적용. 기존 API 요청에서 contact를 생략하면 기존 값 보존.
- [x] 공개본은 생성 시점 복사본: 비공개 변경이 이전 결과물·호스팅에 자동 반영되지 않음을 편집/내보내기 화면에 안내.
- [x] `./gradlew -PverificationBuild check bootJar`, Node 15개 및 macOS Electron 전체 회귀 검증 통과. V8→V9 기존 이름/사진/version 보존, 기본 비공개, 연락처 재시작 유지·충돌 거부·입력 검증, 이메일/전화 선택 공개·비공개 값 JSON/ZIP 제외, 이전 공개본 불변 검증.
- [x] 실제 Electron에서 입력/재시작 유지 및 별도 정적 서버에서 공개 이메일 표시·비공개 전화번호 미출력 검증. 공개 화면 캡처 확인.
- Windows 미검증. 사용자 DB·기존 실행 JAR는 변경하지 않았으며 앱 종료 후 일반 bootJar 갱신 필요. 최신 앱 첫 실행 시 V9 자동 적용.
- 다음: 공개 항목 선택 확대 또는 로컬 백업·복원/파일 정리. 실제 호스팅·Windows 설치 파일은 별도 단계.

### 프로필 편집 사진 영역 복원 (2026-09-29)

- [x] 기존 OnFilm photo-section/photo-preview/photo-actions 스타일로 왼쪽 사진·오른쪽 입력 폼 구성 복원. 첫 입력은 사진 없이 유지, 저장된 프로필 편집 시 표시.
- [x] 사진 클릭/선택/드롭·교체·삭제 및 기존 로컬 portrait API 연결. JPG/PNG 5MB, 긴 변 2,048px 자동 축소. 원본 파일 보존.
- [x] 사진 즉시 저장 안내, 폼 초안 유지 및 version 갱신. 실패/응답 유실은 다시 읽기 전 변경 차단. 사진 삭제는 확인 후 실행.
- [x] `./gradlew -PverificationBuild check bootJar`, Node 15개 및 macOS Electron 전체 회귀 검증 통과. 사진 선택/드롭·축소·교체·삭제·실패 후 다시 읽기·폼 초안 보존·Java/창 재시작 후 사진 유지 확인. 화면 캡처로 좌측 사진 배치 확인.
- Windows 실제 파일 선택/드롭은 미검증. 사용자 DB/원본 및 일반 실행 JAR는 변경하지 않음. 앱 종료 후 일반 bootJar로 실행본 갱신 필요.

### 공개본 ZIP 저장·결과 폴더 열기 (2026-09-29)

- [x] 완료 공개본의 ZIP 생성/캐시, OS 저장 창, 공개용 site 폴더 열기.
- [x] 공개 화면 전용 IPC·UUID/발신자/실제 경로 검증. 기존 파일 및 동명 경합 보호, 실패 전송 임시 파일 정리.
- [x] Node 15개 통과: 기존 파일 보호·취소·경합·불완전 전송·IPC 접근 제한 포함.
- [x] `./gradlew -PverificationBuild check bootJar` 및 macOS Electron 전체 E2E 통과. 공개 ZIP 내용·실패 시 미게시, 실제 API/IPC 저장·취소·동명 파일 보호·폴더 대상, 독립 정적 HLS 재생 및 기존 프로필/사진/영상 회귀 검증. E2E에서는 OS dialog/shell만 대역 사용.
- 일반 실행 JAR/사용자 DB·미디어는 변경하지 않았다. 최신 기능 실행은 앱 종료 후 일반 `bootJar`로 갱신한다.
- [ ] Windows·OS 대화상자/Finder 수동 조작·USB/네트워크 저장소·대용량/공간 부족 검증.
- 다음 후보: 공개 Contact 입력·출력, 공개 항목 선택, 공개본/실패 파일 정리. 호스팅 선택·실제 게시·Windows 패키징은 별도 단계.

### 읽기 전용 공개본·로컬 미리보기 (2026-09-29)

- [x] 프로필 편집 메뉴 → 공개 정보 포함 확인 → 별도 정적 공개본 생성.
- [x] 프로필/SNS/태그/사진/작품/완료 HLS 복사, 공개 전용 JSON, 상대 링크, 편집 UI/DB/토큰/원본 제외.
- [x] 미완료/누락 영상 차단, 단일 생성, staging→atomic 완료, 이전 결과물 보존, 재시작 후 완료 목록·파일 수·byte 조회.
- [x] 보호된 로컬 미리보기 및 종료 링크. 실제 호스팅/외부 게시 없음.
- [x] 백엔드 check/격리 bootJar, Node 13개 통과.
- [x] macOS Electron 생성/미리보기 및 별도 정적 HTTP 서버·독립 창의 프로필/HLS 재생 검증. 로컬 API 요청 없이 동작 확인. 기존 편집/이미지/인코딩/재생 전체 회귀 검증도 통과. 공개 화면 캡처 확인.
- 다음: ZIP 저장/폴더 열기, 공개 항목·Contact 보완. 호스팅 결정은 결과 크기를 확인한 뒤 별도 진행.
- Windows·장편·디스크 고갈 실험 미검증. 상세: `decisions/010-static-portfolio-export.md`.

### 필모그래피 장르 캡슐 입력 (2026-09-28)

- [x] 기존 OnFilm chip/is-custom 스타일 재사용. 키워드 Enter 추가, × 삭제, 기존 저장 장르도 칩으로 표시.
- [x] 공백 정리·빈 입력 무시·대소문자 중복 방지·30자/10개 검사·한글 조합 Enter 보호·전체 폼의 Enter 저장 방지.
- [x] 작품 저장 시 함께 반영. 확정하지 않은 입력은 저장 전 안내하고, 카드 추가/순서 변경 중 입력 초안도 유지.
- [x] 백엔드 check/검증 JAR, Node 13개 통과. 사용자 DB/일반 실행 JAR 변경 없음.
- [x] macOS Electron 추가/삭제/중복/빈 값/길이/개수/조합 이벤트/미확정 입력 안내/재시작 유지 검증. 기존 사진·영상 인코딩/재생·자동재생·미리보기 포함 전체 회귀 검증 통과. 캡처로 칩 배치 확인.
- 표준 장르 서버 검색·드래그 재정렬은 이번 범위에 포함하지 않음. 로컬 문자열 List 형식과 API/DB 스키마는 그대로 유지. Windows IME 실기기 조작은 미검증.

### 영상 재생 보완 요청 (2026-09-28)

- [x] 작품 카드/영상 보기 진입 시 자동재생. 열기/다시 읽기당 한 번만 시도, 탐색 시 일시정지 유지.
- [x] Space/K 재생·정지, ←/→ 5초 이동, ↑/↓ 볼륨, F 전체 화면, M 음소거. 포커스/키 반복 중복 처리 방지.
- [x] 재생 바 hover 별도 음소거 미리보기/시간 표시. 빠른 이동 합치기, 마지막 위치 반영, leave 시 로딩 중지, main 영상 위치 불변. 기존 인코딩 그대로 사용.
- [x] 카드 확대 유지, 파란 hover 테두리 제거. 키보드 흰색 focus-visible 보존.
- [x] `./gradlew -PverificationBuild check bootJar` 통과. 실제 Electron 자동재생/Space/좌우/볼륨/음소거/미리보기/기존 기능 회귀 검증 통과. 화면 캡처 확인.
- [x] 로컬 플레이어 한정 fullscreen 권한과 F 키 진입/복귀 포함 최종 Electron 전체 회귀 검증 통과. Node 권한 정책 테스트 포함 13개 통과.
- Windows·장시간 미리보기 부하는 미검증. 사용자 파일/DB/기존 실행 JAR는 변경하지 않음. 최신 실행은 앱 종료 후 일반 bootJar 필요.

### 로컬 HLS 재생 (2026-09-28)

- [x] 완료된 현재 연결 영상의 manifest/segment 보호 API, 스트리밍/Range 및 경로 제한.
- [x] 기존 OnFilm 재생 화면 구성 재사용. HLS.js 앱 포함, 외부 CDN 없음.
- [x] 작품 카드/편집 화면 진입, 재생·시간 탐색·10초 이동·볼륨·배속·전체 화면·오류 재조회.
- [x] 임시 파일 H2 실제 변환/재시작/연결 해제/경로 거부, 백엔드 check/bootJar 및 Node 12개 통과.
- [x] macOS Electron 실제 재생·다중 segment 탐색·배속·프로필 진입·파일 누락 후 복구, 무인증 403/Range 206/연결 해제 후 404 검증. 기존 프로필·사진·갤러리·작품 회귀 검증도 통과.
- 검증: `./gradlew -PverificationBuild check bootJar` 성공(37회 테스트, 공통 상속 중복 포함, 실패/skip 0), `npm test` 12개, 검증 JAR 지정 `npm run test:e2e` 통과. 화면 캡처 확인. 모두 임시 데이터 사용.
- Windows, 장편/고해상도, 스피커 청취, 전체 화면·볼륨 수동 조작 미검증. 상세: `decisions/009-local-playback.md`.
- 일반 실행 JAR는 이번 검증으로 갱신하지 않음. 앱 완전 종료 후 `backend/./gradlew bootJar`, `desktop/npm start`로 최신 코드를 실행한다.
- 다음 후보: 공개본 내보내기·로컬 미리보기·용량 측정. 호스팅 업체는 결과물 크기 확인 후 결정한다.

### 로컬 HLS 인코딩 (2026-09-28)

- [x] media.encoding 패키지, V8 작업 상태, 단일 DB 대기열 실행기.
- [x] ffprobe 검사 → FFmpeg HLS 변환 → 결과 파일 검증 → 완료 기록.
- [x] 작업 중복 방지·실패 재시도·재시작 후 대기 유지/중단 상태, 원본 보존.
- [x] 편집 화면 인코딩 시작/상태/재시도. 진행 중 폼 편집 유지.
- [x] 실제 짧은 영상 변환 및 파일 H2 테스트. Node 테스트 12개 통과.
- [x] macOS Electron에서 불량 영상 실패/실제 짧은 영상 변환 완료 확인.
- 검증 빌드는 `-PverificationBuild`로 build-verification에 격리. 실행 중인 일반 JAR를 덮어쓰지 않는다.
- HLS 제공·영상 재생 화면은 위 후속 단계로 진행. Windows·바이너리 동봉·장시간 부하·완료 알림은 미구현/미검증.
- 상세: `decisions/008-local-encoding.md`.

### 백엔드 기능별 패키지 분리 (2026-09-28)

- [x] 루트에는 앱 시작점만 유지. config/security/profile/gallery/filmography/media.image/media.video로 Java 클래스 분류.
- [x] 테스트를 기능별 패키지로 이동하고 import 및 패키지 간 필요한 접근 범위 갱신.
- [x] 이미지 공통 기능은 media.image에서 공유하고 영상 저장은 media.video로 분리.
- [x] API 경로, DB/Flyway SQL, 저장 위치, 프론트엔드/Electron 파일 경로는 변경하지 않음.
- [x] `./gradlew check bootJar`, `npm test` 12개, macOS `npm run test:e2e` 통과. 프로필/갤러리/작품/섬네일/영상 저장 및 재시작 동작 확인. Windows는 미검증.
- Controller 내부 로직의 Service/Repository 추출은 이번 변경에 포함하지 않는다.

### 원본 영상 선택·저장·작품 연결 (2026-09-28)

- [x] V7 영상 파일 기록 및 작품 연결. 앱 전용 media/videos 폴더로 스트리밍 복사, 원본 불변.
- [x] 기존 원본 영상 영역에 파일 선택/드롭·전송 진행률·파일명/크기·교체·연결 해제.
- [x] MP4/MOV 최대 2GB, 컨테이너 식별·바이트 수 검사. 실제 코덱/영상 트랙 검증은 다음 단계.
- [x] 복사 후 DB 연결, 공통 version 충돌 시 기존 영상 보존, 재시작 시 미완료 상태 구분, 파일 누락 표시.
- [x] 파일 H2 테스트 및 Node 테스트 통과.
- [x] macOS Electron E2E: 7MiB 컨테이너 fixture 선택·복사·잘못된 파일 후 재조회·메타데이터 수정 중 연결 보존·재시작·교체·연결 해제. 캡처로 화면 확인.
- 검증: `./gradlew check bootJar`, `npm test` 12개, `npm run test:e2e` 통과. 실제 사용자 데이터는 사용하지 않았다.
- 미연결·실패 복사본은 복구용으로 보관하여 디스크 사용량이 누적될 수 있다. 정리 UI는 후속 작업.
- 다음: FFmpeg/ffprobe·로컬 인코딩 작업. Windows, 2GB 실제 파일, OS 파일 선택/드롭 수동 조작 미검증.
- 상세: `decisions/007-local-video-import.md`. 아래 이전 단계의 ‘영상 미구현’은 인코딩/재생 미구현으로 범위를 갱신한다.

### 이미지 자동 축소

- [x] 800만 화소 거부 대신 긴 변 최대 2,048px 자동 축소(비율/투명도 유지, 확대 없음).
- [x] 디코딩 시 subsampling, 단일 변환 제한, 비정상 크기 방어.
- [x] 갤러리 안내 및 실패 코드/메시지 개선. 원본·기존 저장 데이터 보존.
- [x] `./gradlew check bootJar`, `npm test` 12개, `npm run test:e2e` 통과. 가로/세로 JPEG·PNG 축소, 작은 사진 크기 유지, 투명도, 원본 바이트 보존, 실패 코드 검사.
- [x] macOS Electron에서 4032×3024 PNG 2장 업로드 후 실제 이미지가 2048×1536인지 확인. 저장·정렬·재시작·삭제 및 미지원 파일 안내 검증. Windows는 미검증.

### 작품 섬네일 (2026-09-22)

- [x] V6 전용 BLOB 테이블. 작품 삭제 시 FK cascade로 이미지도 동일 트랜잭션에서 삭제.
- [x] 기존 섬네일 영역에 파일 선택/드롭·미리보기·교체·삭제 연결, 프로필 카드 반영.
- [x] 공통 ImageNormalizer로 JPEG/PNG 5MB 제한 및 2,048px 자동 축소. 원본 불변.
- [x] 작품 정보와 공통 version 사용. 잘못된 파일/없는 작품/오래된 버전 실패 시 기존 이미지 보존.
- [x] 파일 H2 재시작·교체·삭제·작품 삭제·정보 수정 시 이미지 보존 테스트.
- [x] macOS Electron E2E: 4032×3024 업로드 → 2048×1536, 잘못된 파일 후 다시 읽기, 정보 편집 후 이미지 유지, 재시작 후 카드 표시, 800×600 교체, 삭제. 화면 캡처 확인.
- 검증: `./gradlew check bootJar`, `npm test` 12개, `npm run test:e2e` 통과. 테스트는 임시 DB만 사용했다.
- 섬네일은 즉시 저장, 작품 정보는 저장 버튼으로 반영. 새 작품 및 미저장 정보는 먼저 저장하도록 안내.
- 다음: 영상 파일 선택·로컬 인코딩. Windows 실행 및 OS 파일 탐색기/드롭의 실제 수동 조작은 미검증.

### 필모그래피 작품 정보 편집 (2026-09-22)

- [x] 원본 편집 CSS/카드 배치 재사용. 별도 편집 화면 및 프로필 카드 연결.
- [x] 작품 정보·여러 참여 역할·배역·장르 등록/수정/삭제/순서 변경. 저장 버튼으로 일괄 반영.
- [x] V5 파일 H2 저장, version 충돌/잘못된 입력 롤백, 재시작 영속화 테스트.
- [x] 저장 응답 유실 시 초안 유지·재저장 차단·다시 읽기, 미저장 이동 확인.
- [x] macOS Electron E2E: 작품 등록·재시작·편집·순서 변경·삭제, 응답 유실 후 재조회(중복 없음). 편집 화면 캡처로 배치 확인.
- 검증: `./gradlew check bootJar`, `npm test` 12개, `npm run test:e2e` 통과. 기존 프로필/갤러리 E2E도 유지.
- 다음: 섬네일·영상 업로드/로컬 인코딩. Windows, 공개 설정, 드래그 정렬, 표준 장르 검색은 미구현/미검증.
- 이전 기록의 ‘필모그래피 미연결’은 이 단계로 대체한다. 상세: `decisions/006-local-filmography.md`.

### 현재 UI 기준: 원본 OnFilm 프로필 구성을 그대로 유지

- [x] 원본 HTML 프로필 배치·FILMOGRAPHY/PHOTO 빈 상태 아이콘/버튼·편집 메뉴 복원.
- [x] 원본 기본 이미지, 로컬 SNS 아이콘, 사진 확대 보기. 임시 카드형 조회 UI 제거.
- [x] 초기 입력에는 사진/필모그래피 없음, 랜딩페이지 없음.
- [x] 최종 원본 기본 이미지·SNS 아이콘 포함 Electron 검증. 빈 상태 전체 화면 캡처로 배치 확인.
- 검증: `./gradlew check bootJar`, `npm test` 12개, `npm run test:e2e` 통과. 빈 상태 버튼/미연결 안내·톱니바퀴 편집·사진 등록/재시작·확대/닫기 확인. Windows는 미검증.
- 필모그래피 등록은 아직 미구현. 버튼은 원본 UI를 유지하고 미연결 안내를 제공한다. 상세: `decisions/004-original-profile-layout.md`.

### 방향 수정: 기존 OnFilm UI 우선 (2026-09-22)

- [x] 새 임시 UI 대신 기존 OnFilm의 CSS와 프로필 폼 구성을 재사용.
- [x] 초기 화면은 프로필 입력만: 이름·출생일·출생지·소개글·SNS·태그.
- [x] 사진·갤러리 UI 제외. 기존 데이터·API·V1~V3 보존.
- [x] V4로 SNS/태그 저장 지원. 기본 정보와 원자적으로 저장, URL/태그 검증.
- [x] 변경된 초기 화면 실제 Electron 확인: 프로필·SNS·태그 저장 후 재시작 유지, 사진 입력 없음, 화면 캡처 확인.
- 검증: `./gradlew check bootJar`, `npm test`(12개), `npm run test:e2e` 통과. 사진·갤러리 API 영속화 테스트는 유지하고 E2E는 현재 프로필 전용 화면 기준으로 변경했다. Windows는 미검증.
- [x] 기존 actor-detail 스타일로 프로필 조회 화면 이식: 이름·출생 정보·소개·SNS·태그, 편집 진입.
- [x] 첫 입력 → 저장 → 조회, 재실행 → 조회, 재편집 → 저장 → 조회 흐름. 조회 실패 재시도.
- [x] macOS Electron E2E: 첫 저장 후 조회·재실행 조회 시작·재편집 후 반영·조회 실패 재시도 확인. 캡처로 화면 확인.
- 조회 화면 단계 검증: `./gradlew check bootJar`, `npm test` 12개, `npm run test:e2e` 통과. DB 스키마 변경 없음. Windows는 미검증.
- 필모그래피·사진을 초기 입력에 다시 추가하지 않는다. 후속 작업은 기존 화면에서 필요한 기능을 선별 이식한다.

### 별도 갤러리 편집 화면 연결

- [x] 초기 입력과 분리된 `/edit-gallery.html`, 기존 OnFilm CSS·갤러리 카드·업로드 영역 재사용.
- [x] 프로필 생성 이후 ‘사진 관리’ 진입, 프로필로 복귀하면 사진/정렬 반영.
- [x] 파일 선택·드롭, 앞뒤 이동·삭제, 개수 표시, 실패 후 다시 읽기 전 변경 제한.
- [x] 프로필의 갤러리 조회 실패는 기본 프로필 조회와 분리하여 재시도 가능.
- [x] macOS Electron E2E: 별도 편집 화면 추가·정렬·업로드 실패 후 변경 차단/다시 읽기·재시작·삭제·프로필 반영 확인.
- 검증: `./gradlew check bootJar`, `npm test` 12개, `npm run test:e2e` 통과. Windows 및 드래그앤드롭의 OS 실제 조작은 별도 수동 검증 필요.
- 초기 입력에 사진 추가 없음. 기존 DB/API 재사용으로 스키마 변경 없음. 대표 사진 편집 화면·필모그래피는 후속 단계.

### 두 번째 단계

- [x] V2 마이그레이션: 기존 이름·소개를 보존하며 생년월일·출생지·대표 사진 추가.
- [x] 대표 사진 업로드·교체·삭제, 이미지 내용/용량/화소 검증, version 충돌 검사.
- [x] 대표 사진은 H2 BLOB으로 원자적 변경. 원본 파일은 변경하지 않음. 선택 이유는 `decisions/002-local-portrait.md` 참고.
- [x] 백엔드 5개 및 Node 12개 테스트 통과.
- [x] 확장된 Electron E2E: macOS 실제 창에서 사진 업로드 후 Java·창 재시작, 사진 픽셀·생년월일·출생지 유지 확인.
- [x] 갤러리 최대 12장 추가·정렬·삭제 API/UI 및 V3 마이그레이션.
- [x] 파일 H2 재시작 후 사진·정렬 유지, 중복 정렬·오래된 버전·잘못된 이미지·개수 제한 실패 시 롤백 검증.
- [x] macOS Electron E2E: 두 장 선택 업로드·앞뒤 이동·Java/창 재시작 후 정렬 유지·삭제 확인.
- [ ] 기타 프로필 필드, 실제 Windows 검증.

1. 첫 기능 사용자 실행 확인. 설치 파일 배포 전까지 Java 21/Node는 개발 환경에 필요하다.
2. 프로필 기본 정보·사진·갤러리 이식. 파일 복사·삭제 실패 처리와 데이터 경로 확인.
3. 필모그래피와 필요한 스토리보드 기능.
4. 영속 인코딩 Job·제한된 실행기·FFmpeg. 앱 중단 후 재시도.
5. 공개본 내보내기·미리보기. 실제 용량·파일 수 측정 후 호스팅 선택.
6. 게시·업데이트·중단과 실패 복구.
7. Windows 설치·런타임 동봉·코드 서명·백업·복원·업데이트.

## 검증 기록 — 2026-09-22

- 실제 작업 폴더는 `/Users/whheo/Desktop/onfilm-local`이다(인계 문서 제안 경로와 다름).
- 기존 API/Worker 코드 및 실제 DB·미디어·비밀 파일은 수정하거나 이관하지 않았다.
- `backend/./gradlew check bootJar` 성공. H2는 이 프로젝트의 실제 DB로 테스트하며 MySQL 검증을 주장하지 않는다.
- `desktop/npm test` 12개 통과.
- `desktop/npm run test:e2e` 성공. 실제 창에서 저장하고 Java 프로세스·창을 새로 열어 한글 프로필 유지 확인. 무인증·외부 Origin 403, 잘못된 입력 400, 오래된 버전 저장 409, renderer Node 접근 및 외부 이동 차단 확인.
- E2E에서 마지막 창 종료 시 테스트가 일찍 끝나던 문제를 수정한 뒤, 두 번째 실행의 재조회까지 통과 로그를 확인했다.
- Windows·최종 설치 파일·영상·온라인 게시 미검증/미구현.
- 갤러리 단계: `./gradlew check bootJar`, `npm test`, `npm run test:e2e` 통과. 백엔드는 8회 테스트 실행(공통 영속화 테스트 상속으로 2회 중복 포함), Node는 12개 통과. 기존 V1/V2는 수정하지 않고 V3를 추가했다.
