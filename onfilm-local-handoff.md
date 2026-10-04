# OnFilm Local — 새 프로젝트 인계 문서

작성일: 2026-09-22  
목적: 새 `onfilm-local` 작업 폴더에서 시작하는 Codex가 기존 대화 없이도 개발을 이어가게 한다.

## 1. 가장 먼저 읽을 결정

**기존 서버형 OnFilm에 로컬 모드를 계속 확장하지 않는다. 별도 로컬 전용 프로젝트를 만들고 필요한 코드를 선별 이식한다.**

처음에는 기존 API·MySQL·Kafka·Worker를 Electron과 함께 실행하려 했지만, 1인용 PC 앱에 비해 설치·운영 부담이 크다고 판단했다. 사용자는 로컬 전용 프로젝트를 새로 만드는 방향에 동의했다.

- 기존 `onfilm`, `onfilm-encoding-worker`는 보존한다.
- 새 프로젝트에서 Kafka, 별도 Worker 서버, RDS, Docker를 사용자 필수 실행 요소로 삼지 않는다.
- 분산 전달을 위한 Outbox·Inbox·Callback 구조를 그대로 이식하지 않는다.
- FFmpeg는 로컬 자식 프로세스로 실행하며, 작업을 관리하는 백그라운드 실행기는 필요하다.
- 재시도·중단 복구·중복 실행 방지라는 요구사항은 유지하되 로컬 구조로 다시 설계한다.
- 예전 계획의 “Worker local 프로필 추가·Kafka 실행”을 다음 작업으로 자동 재개하지 않는다.

이번 인계 작업은 문서만 작성했다. 새 프로젝트 생성·파일 이식·기존 데이터 이동·커밋은 하지 않았다.

## 2. 사용자의 목표

- 사용자: 배우 1명. 다중 사용자 SaaS 출시가 아니다.
- 개발 환경: macOS. 최종 사용 환경: Windows.
- 화면: Discord PC 앱처럼 **Electron 전용 창**. 외부 브라우저에서 편집하는 방식은 원하지 않는다.
- 프로그래밍을 모르는 사용자가 아이콘으로 실행하고, 프로필을 꾸미고, 게시 버튼만 사용할 수 있어야 한다.
- 인터넷 없이 프로필·필모그래피·사진을 편집하고 영상을 인코딩할 수 있어야 한다.
- 공개본은 제작자가 링크를 열어 프로필 조회·영상 재생·연락처 확인만 하는 웹페이지다.
- 댓글은 필요 없다. 배우의 전화번호·이메일 등 선택한 연락처를 공개한다.
- 로컬 수정은 즉시 공개하지 않는다. `[게시 내용 업데이트]`를 눌러 같은 링크의 공개본을 교체한다.
- PC가 꺼져 있어도 게시된 포트폴리오는 볼 수 있어야 한다.
- 사용자가 AWS 등 클라우드 계정을 설정하는 것은 장벽이 크다. 최초 설치·연결은 개발자가 도울 수 있다.
- 비용을 낮추고 예측 가능하게 하는 것이 중요하다. 무제한 무료를 약속하지 않는다.
- **호스팅은 아직 미정.** 공개 결과물의 파일 크기·개수와 예상 시청량 확인 후 결정한다. Vercel·Cloudflare R2는 검토 후보였을 뿐이다.

## 3. 새 프로젝트 구조와 미결정 사항

제안된 구조이며 아직 생성하지 않았다.

```text
onfilm-local/
├── desktop/       Electron 앱
├── backend/       새 Spring Boot 프로젝트
└── docs/          계획·결정·검증 기록
```

Spring Initializr에서 사용자가 직접 만들 필요는 없다. 빈 폴더에서 Gradle과 소스를 구성해도 된다. 기존 프로젝트 안에 패키지만 추가한다는 뜻이 아니다.

목표 실행 구조:

```text
Electron → 로컬 Spring Boot
             ├─ 프로필·파일 관리
             ├─ 내장 DB
             └─ 영속 작업 기록 + 제한된 백그라운드 실행기 → FFmpeg
```

아직 결정하지 않은 항목:

- 내장 DB 종류. SQLite/H2 등은 후보이며 선택된 것이 아니다. JPA·SQL·마이그레이션·파일 잠금·백업·패키징을 비교한다.
- 새 프로젝트의 Java/Spring Boot 버전과 패키지명.
- 기존 User/Person 관계의 이식 범위와 로컬 사용자 식별 방식. 1인용이라고 모든 인증을 없애지 않는다.
- 기존 데이터 이관 여부. 기본적으로 새 데이터 영역으로 시작하고 이관은 별도 확인한다.
- Windows 버전·CPU 아키텍처·실제 검증 PC, 설치 도구·코드 서명.
- 호스팅, 비용 부담 계정, 공개 기간·접근 제한, 게시 권한 보관 방식.

기존 프로젝트는 Java 17 / Spring Boot 3.3.4, 현재 Electron 셸은 44.4.3이다. 이것은 현황이지 새 프로젝트에 같은 버전을 반드시 사용하라는 요구는 아니다.

## 4. 원본 위치와 접근 원칙

현재 macOS 경로:

```text
API:    /Users/whheo/Desktop/onfilm/onfilm
Worker: /Users/whheo/Desktop/onfilm/onfilm-encoding-worker
새 폴더 제안: /Users/whheo/Desktop/onfilm/onfilm-local
```

새 작업 환경에서는 경로와 접근 권한을 다시 확인한다. 원본 접근이 불가능하면 사용자에게 필요한 소스 폴더를 제공받는다. 원본은 읽기·복사 대상으로 두며 삭제·이동·리팩터링하지 않는다. 각각의 `AGENTS.md`도 읽는다.

원본 API/Worker를 수정하게 된다면 해당 저장소의 MySQL·Flyway·DB 소유권 규칙을 따라야 한다. 새 독립 프로젝트에 분산 DB 구조를 강제로 복제할 필요는 없지만, 기존 DB를 새 로컬 코드가 직접 수정하게 해서는 안 된다.

## 5. 재사용할 코드 지도

아래 경로는 API 저장소 기준이다.

| 대상 | 위치 | 이식 시 주의 |
|---|---|---|
| Electron 셸 | `desktop/src/main.cjs`, `window.cjs`, `policy.cjs` | 창·보안·동일 출처 제한·중복 실행 재사용 |
| 안내·재시도 UI | `desktop/src/status.*`, `preload.cjs` | IPC 발신자 검증 유지 |
| API 실행 관리자 | `desktop/src/api-process.cjs` | 소유 프로세스만 종료, 준비 상태 확인·재시도 재사용 |
| API 실행 설정 | `desktop/src/api-config.cjs` | 기존 루트/JAR 경로·MySQL/Callback 비밀값 요구는 새 구조에 맞게 제거/변경 |
| 테스트 | `desktop/test/` | 정책·자식 프로세스·Electron 스모크 테스트 선별 재사용 |
| 웹 화면 | `src/main/resources/static/` | `/js/auth.js` 등 기존 인증·API 경로 의존성 및 외부 CDN 확인 |
| 프로필 | `domain/movie/entity/Person.java`, `PersonSns.java` | Java 경로 앞에 `src/main/java/com/onfilm/` 추가 |
| 프로필 서비스 | `domain/movie/service/PersonCommandService.java`, `PersonQueryService.java`, `PersonMediaService.java` | 기능·입력 규칙 재사용, 기존 사용자/파일 서비스 결합 조정 |
| 사용자 연결 | `domain/movie/service/CurrentPersonProvider.java`, `domain/user/entity/User.java` | 기존 JWT 로그인 구조를 무조건 전부 이식하지 않음 |
| 필모그래피 | `domain/movie/service/FilmographyCommandService.java`, `FilmographyQueryService.java` | 프로필 최소 흐름 완성 후 이식 |
| 스토리보드 | `domain/movie/service/StoryboardCommandService.java`, `StoryboardQueryService.java` | 첫 수직 기능 이후 필요한 순서로 이식 |
| 로컬 저장소 | `src/main/java/com/onfilm/domain/file/infrastructure/local/LocalStorageService.java` | storageKey 검증, 실제 경로·파일 URL 분리 재사용 |
| 참고 실행 설정 | `src/main/resources/application-local.yml` | 기존 MySQL/Kafka 의존 설정이므로 통째로 복사하지 않음 |
| 준비 확인 endpoint | `src/main/java/com/onfilm/domain/common/DesktopHealthController.java` | 실행 인스턴스 식별용, 인증 토큰 아님 |

Worker에서 참고할 파일(Worker 저장소 기준):

- `src/main/java/kr/co/onfilm/encodingworker/infra/transcode/FfmpegCommandFactory.java`
- `src/main/java/kr/co/onfilm/encodingworker/infra/transcode/FfmpegTranscoder.java`
- `src/main/java/kr/co/onfilm/encodingworker/infra/transcode/MediaProbe.java`
- `src/main/java/kr/co/onfilm/encodingworker/infra/storage/LocalStorageClient.java`

위 인코딩 코드는 기존 메시지 DTO·설정·예외 타입에 의존할 수 있다. Kafka 메시지 대신 로컬 작업 요청 모델을 사용하도록 의존성을 분리한다. FFmpeg 코드 복사만으로 장애 복구가 완성됐다고 보지 않는다.

## 6. 기존 작업 상태: 커밋과 검증을 혼동하지 말 것

- 첫 Electron 셸 구현은 사용자가 커밋하고 실행을 확인했다고 말했다.
- 이후 API 자동 실행과 `local` 프로필을 구현했다. 문서 작성 시 이 변경들은 아직 미커밋 상태다.
- 새 프로필·준비 endpoint·실행 관리자·테스트 일부는 **untracked 파일**이다. HEAD만 복사하면 누락된다. 시작 시 `git status --short`와 실제 파일을 함께 확인한다.
- 사용자가 `desktop/.env` 설정 완료를 알렸고, 값 노출 없이 실시한 실행 설정 검사는 통과했다.
- 그러나 실제 MySQL에 연결한 local 자동 실행→로그인→편집→인코딩 전체 성공은 확인하지 않았다.
- 기존 Worker `dev`는 H2 메모리 DB, `create-drop`, Flyway 비활성 설정이다. MySQL 작업 기록을 사용한다고 가정하면 안 된다.
- 기존 DB와 파일은 보존 대상이다. 테스트 중이라는 이유로 초기화하지 않는다.

이전에 수행한 검증(이번 인계 작성에서 다시 실행한 것이 아님):

- `desktop/npm test`: 12개 통과.
- macOS 실제 Electron + 테스트용 자식 HTTP 서버: 시작 대기·연결 실패·재시도·비정상 종료·재시작·격리 확인.
- API local 설정·준비 endpoint 테스트 3개, 전체 `./gradlew test`, `bootJar` 성공.
- MySQL `integrationTest`, 전체 `check`, 실제 Windows 검증은 해당 단계에서 미실행.

복사하지 않을 것: `desktop/.env`, `infra/mysql/.env`, 실제 DB 파일·볼륨, 원본 영상·사진, `node_modules`, `build`, 개인 이력서. 예제 설정과 lockfile은 선별 복사 가능하다. 비밀값은 채팅이나 Git에 출력하지 않는다.

## 7. 첫 개발 순서

### A. 준비·설계

- [ ] 새 작업 폴더와 원본 읽기 권한 확인. 원본 변경은 보존.
- [ ] 이 문서를 새 프로젝트 `docs/`에 두고 새 체크리스트 작성.
- [ ] 원본 인증·Entity·MySQL 전용 SQL 의존성을 짧게 조사.
- [ ] 내장 DB 선택 근거와 로컬 사용자 식별·위조 요청 방어 방식을 정리.
- [ ] 새 DB 전용 스키마/마이그레이션과 데이터 폴더를 결정. 원본 MySQL 마이그레이션 그대로 사용 금지.

### B. 첫 수직 기능 — 여기부터 구현

**Electron 실행 → 로컬 API 자동 시작 → 프로필 이름·소개 입력 → 내장 DB 저장 → 종료·재실행 → 값 유지.**

- [ ] `desktop/`, `backend/` 최소 구조 생성. Kafka·MySQL 드라이버 등 불필요한 의존성 제외.
- [ ] Java 런타임과 JAR 실행 경로를 새 구조에 맞춰 수정.
- [ ] 설치 폴더와 데이터 폴더 분리, OS별 사용자 데이터 경로 사용.
- [ ] 프로필 최소 API·입력 검증·화면 연결. 기존 UI/API 형태는 재사용하되 억지로 모든 기능을 끌고 오지 않음.
- [ ] 중복 실행·시작 실패·포트 충돌·정상 종료 테스트.
- [ ] 앱 재실행 후 데이터 유지 자동 테스트 및 수동 확인.
- [ ] Windows에서 최소 실행을 일찍 확인. 맥 테스트만으로 Windows 성공 선언 금지.

### C. 이후 확장

1. 사진·갤러리와 필모그래피, 필요한 스토리보드 기능.
2. 영속 인코딩 작업 기록 + 제한된 실행기 + FFmpeg.
3. 실패·중단 후 재시도, 디스크 부족·손상 파일 처리, HLS 재생·탐색.
4. 읽기 전용 공개 결과물 내보내기와 미리보기.
5. 용량·파일 수 측정 후 호스팅 선택.
6. 게시·같은 링크 업데이트·중단, 실패해도 기존 공개본 유지.
7. Windows 패키징·런타임 동봉·백업·복원·업데이트 검증.

## 8. 로컬에서도 반드시 지킬 원칙

- 로컬 HTTP는 loopback에만 바인딩한다. 외부 웹페이지의 위조 요청까지 loopback만으로 차단되지는 않으므로 Origin/인증 등 방어가 필요하다.
- Electron renderer에 Node·광범위 파일/프로세스 권한을 주지 않는다. sandbox·context isolation·제한된 IPC를 유지한다.
- FFmpeg를 쉘 명령 문자열로 조합하지 않고 인자 배열로 실행한다. 경로·출력 파일·작업 취소를 검증한다.
- API와 인코딩이 한 PC의 CPU를 공유하므로 동시 작업 수·스레드·메모리를 제한한다.
- 인코딩 작업을 메모리에만 저장하지 않는다. 대기/실행/성공/실패 및 결과 파일을 영속 기록한다.
- 중단 시 일부 파일을 완료 결과로 취급하지 않는다. 재실행 시 단계별 복구와 재인코딩 범위를 정의한다.
- DB와 파일을 동시에 변경해도 하나의 DB 트랜잭션으로 묶이지 않는다. 실패 복구·파일 정리·백업 일관성을 설계한다.
- 기본 프로필·테스트 데이터로 기존 사용자 데이터를 덮어쓰지 않는다.
- 게시용 데이터에는 비밀번호·토큰·로컬 경로·내부 작업 기록을 포함하지 않는다.
- 호스팅 가입·유료 리소스 생성·공개 게시·기존 데이터 이관은 별도 확인 후 진행한다.

## 9. 다음 Codex에 전달할 시작 메시지

```text
이 폴더는 새 onfilm-local 프로젝트입니다.
docs/onfilm-local-handoff.md를 먼저 읽고 이어서 개발해 주세요.
맥에서 개발하고 Windows에서 배우 한 명이 사용하는 Electron + Spring Boot 로컬 앱입니다.
기존 API/Worker는 보존하고 필요한 코드만 선별 재사용합니다.
Kafka·별도 Worker 서버·사용자 MySQL 설치가 필요한 구성을 새 프로젝트에 그대로 가져오지 마세요.
먼저 내장 DB와 최소 실행 구조를 검토한 뒤,
Electron 실행 → 프로필 저장 → 재실행 후 유지까지 작은 단위로 구현해 주세요.
단계별 검증 결과와 미완료 사항을 계획서에 기록해 주세요.
```

## 10. 참고 문서

- 기존 단계별 계획: 원본 API의 `docs/plans/local-desktop-development-plan.md` — 전환 전 계획이므로 최신 방향은 이 인계 문서를 우선한다.
- 기존 Electron 실행 안내: 원본 API의 `desktop/README.md`.
- 기능 학습 문서: 원본 API의 `docs/onfilm-study/`.
- 기존 분산 구조/DB 정책: 원본 API와 Worker 각각의 `AGENTS.md` 및 관련 결정 문서. 원본을 수정할 때 적용한다.
