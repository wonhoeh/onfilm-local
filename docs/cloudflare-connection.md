# Cloudflare 연결 설정

## 현재 기능

데스크톱 앱에서 `공개본 만들기 → Cloudflare 연결`로 이동한다. 계정 ID, R2 버킷과 접근 키, Pages 프로젝트와 배포 토큰, 두 공개 주소를 입력하고 `설정 저장 → 연결 확인`을 누른다.

| 입력 항목 | 값 또는 확인 위치 |
| --- | --- |
| Account ID | Cloudflare 계정 ID 32자리. R2 S3 endpoint의 호스트 앞부분 |
| 프로필 도메인 | `https://onfilm.co.kr` |
| 공개 주소 이름 | 예: `won-ho_01` → `https://onfilm.co.kr/won-ho_01` |
| 미디어 주소 | `https://media.onfilm.co.kr` |
| 버킷 | `onfilm-media` |
| R2 Access Key ID / Secret Access Key | 해당 버킷의 Object Read & Write 키 |
| Pages 프로젝트 | `<프로젝트>.pages.dev`에서 프로젝트 이름만 입력 |
| Pages API Token | 해당 계정의 Account → Cloudflare Pages → Edit 권한 토큰 |

현재 입력은 기본 jurisdiction의 R2 버킷을 대상으로 한다. S3 endpoint는 계정 ID로 생성하며 임의 주소로 인증 정보를 보내지 않는다.

저장 후 키 입력란은 비워지고, 다시 열어도 비밀값을 반환하지 않는다. 같은 계정에서 키 입력란을 비워 저장하면 기존 키를 유지한다. 계정을 바꾸면 키를 모두 다시 입력해야 하며, Access Key ID를 교체할 때 Secret Access Key도 입력한다.

공개 주소 이름은 영문 소문자·숫자·하이픈(`-`)·언더바(`_`) 3~30자다. 앞뒤 공백은 제거하며 대문자를 자동 변경하지 않는다. 경로 구분자·점·한글·내부 공백은 허용하지 않는다. 앱의 경로와 충돌하는 `api`, `assets`, `media`, `css`, `js`, `images`, `fonts`, `vendor`, `filmography`, `video-player`, `cloudflare`, `_headers`, `_redirects`, `_worker`, `_routes`는 예약어다. renderer와 Electron main에서 검사한다.

입력하는 동안 완성 주소를 미리 표시하고, 저장한 이름은 앱 재실행 후에도 유지한다. 이름이 없던 기존 연결 설정은 키를 보존한 채 불러오며 연결 확인도 계속 사용할 수 있다. 다음 저장 때 이름만 추가하면 된다. 기존 설정 파일은 읽기만으로 자동 변경하지 않는다.

현재 이름은 **게시할 때 사용할 설정**이다. 저장하거나 이름을 변경하는 것만으로 기존 사이트를 이동·종료하거나 새 경로로 ZIP을 생성하지 않는다. Pages 프로젝트 이름과 공개 주소 이름은 별개다. 공개본 화면에서 게시를 실행하면 해당 이름 아래로 배치한다. 자세한 절차는 [게시 안내](cloudflare-publishing.md)를 참고한다.

## 연결 확인의 범위

- R2: S3 ListObjectsV2(MaxKeys=1) 조회로 버킷 접근 여부를 확인한다. 파일 이름은 화면에 전달하지 않는다.
- Pages: 해당 계정·프로젝트를 GET으로 조회한다.
- 두 결과를 별도로 표시한다. 한쪽 실패가 다른 쪽의 결과를 숨기지 않는다. 제한 시간은 20초이며 상태 변경 요청은 하지 않는다.
- 조회 성공이 업로드·배포 권한까지 검증했다는 뜻은 아니다. 공개 주소의 DNS·CORS·캐시·영상 재생도 이 검사에는 포함하지 않는다.

설정 저장·조회 확인만으로 파일이 이동하거나 사이트가 바뀌지 않는다. 공개본 화면의 **게시**를 별도로 실행해야 R2 업로드와 Pages 배포가 진행된다. 게시 종료·사용량 집계는 아직 지원하지 않는다.

## 키 보관

Electron main의 safeStorage를 사용한다(macOS Keychain / Windows DPAPI). 암호화 저장소를 사용할 수 없거나 Linux basic_text 저장소이면 저장을 거부하고 평문으로 대체하지 않는다. Windows의 같은 사용자 권한으로 실행하는 다른 프로그램까지 보호하는 구조는 아니다.

파일은 `<앱 데이터 경로>.connections/cloudflare.enc`에 저장한다. 예를 들어 실제 데이터가 `.../OnFilm Local/data`라면 연결 설정은 형제 폴더 `.../OnFilm Local/data.connections`에 있다. 공개본·프로필 백업에는 포함하지 않으며, 다른 PC에서는 키를 다시 입력한다. 임시 파일에 암호화 결과를 기록·동기화한 후 교체한다.

`이 PC의 연결 설정 삭제`는 로컬 설정 파일만 제거한다. 실제 Cloudflare 토큰을 폐기하거나 공개 사이트·R2 파일을 삭제하지 않는다. 복호화할 수 없을 때도 이 기능으로 설정을 지우고 다시 입력할 수 있다.

설정 IPC는 현재 앱 main frame의 `/cloudflare.html`에만 허용한다. renderer의 Node 접근 및 기존 loopback 토큰·Host/Origin·CSP는 유지한다. 비밀값을 로그·URL·Git에 저장하지 않는다. 저장소 안의 `cloudflare/security key/`는 Git에서 제외하며 앱이 자동으로 읽거나 이관하지 않는다.

## 다음 단계

1. 실제 계정에서 설정 저장과 두 조회 연결을 확인한다.
2. 공개본을 만들어 게시하고 `/<주소이름>/` 공개 페이지와 실제 R2 CORS·영상 재생을 확인한다.
3. 필모그래피 전용 공개 페이지를 추가한다.
4. 게시 종료와 이전/실패 미디어·캐시 정리 범위를 구현한다.
5. 사용량 표시 및 Windows 패키징·보안 저장소 검증을 진행한다.

## 검증 방법

- `backend`: `./gradlew -PverificationBuild check bootJar`
- `desktop`: `npm test`
- `desktop`: `ONFILM_TEST_JAR=/절대경로/backend/build-verification/libs/onfilm-local.jar npm run test:cloudflare-ui`
- 기존 회귀: 같은 JAR 환경변수로 `npm run test:e2e`

Cloudflare 단위 테스트·GUI 테스트는 임시 폴더, 테스트 암호화 제공자, 가짜 응답을 사용한다. 실제 계정·비밀키·클라우드 파일은 사용하지 않으며 OS 보안 저장소와 실제 업로드 검증을 대체하지 않는다.
