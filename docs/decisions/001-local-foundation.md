# 001. 로컬 최소 구조

날짜: 2026-09-22

## 선택

- Java 21 / Spring Boot 3.5.16. 원본 Java 생태계를 재사용하면서 3.x 계열에서 시작한다. 4.x 전환을 첫 프로필 이식과 함께 진행하지 않는다.
- Electron 44.4.3. 원본 셸의 보안·연결·프로세스 관리 코드를 선별 복사 후 새 프로젝트에 맞게 수정했다.
- 파일형 H2 + Flyway. H2 메모리 모드, MySQL 호환 모드, TCP 서버, H2 웹 콘솔을 사용하지 않는다.
- 첫 저장 기능은 Spring JDBC. 단일 프로필의 명시적인 SQL과 version 조건으로 시작하며, 원본 JPA Entity/User 관계 전체를 끌고 오지 않는다.
- 앱 전용 로컬 접근 토큰. 로그인/Refresh Token/Callback 대신 실행마다 난수 토큰을 만들어 소유 API에 전달한다.

## DB 비교와 이유

| 선택지 | 장점 | 이번 단계의 비용 |
|---|---|---|
| MySQL | 원본 SQL·JPA와 가까움 | 별도 서버 설치·실행, 사용자의 부담 증가 |
| SQLite | 데스크톱 파일 DB로 적합 | JDBC 드라이버/네이티브 패키징 및 ORM·마이그레이션 호환성 추가 검토 |
| 파일형 H2 | Java 프로세스 안에서 동작, 기존 Java 도구와 통합 용이 | MySQL SQL을 그대로 사용 불가, H2 버전 업그레이드·백업 정책 필요 |

SQLite도 가능한 선택이지만, 첫 Java 기반 구현에서는 H2를 선택한다. 기존 MySQL V1을 복사하지 않고 새 단일 profile 테이블을 정의한다. DB 잠금을 끄거나 자동 서버 모드로 여러 앱이 공유하게 하지 않는다. 이미 열려 있으면 실행 오류를 안내한다.

프로필은 id=1인 한 행으로 시작한다. 이름과 소개 길이는 원본 규칙(60/120)을 유지한다. DTO 검증과 DB 길이/NOT NULL 제약을 함께 사용한다. 빈 초기 행은 작성 전 상태이며 저장 요청의 이름은 공백일 수 없다. version 조건으로 이전 화면의 저장이 최신 데이터를 덮어쓰지 못하게 한다.

## 인증·로컬 보안

Electron 메인 프로세스가 난수 토큰과 인스턴스 ID를 생성한다. Java 자식에는 환경변수로 전달하며 renderer에는 토큰 조회 API를 제공하지 않는다. 해당 창의 loopback 요청에만 메인 프로세스가 인증 헤더를 붙인다. Java는 모든 경로에서 토큰과 Host를 검사하고, Origin이 있으면 정확한 자체 출처와 비교한다. cross-site 요청도 거부한다. 준비 확인도 토큰과 인스턴스 ID를 확인한다.

새 창·외부 이동·webview를 제한하고 CSP로 외부 스크립트·프레임을 차단한다. 임시 Electron 세션을 쓰므로 별도 웹 로그인 상태를 관리하지 않는다. 이 모델은 외부 사이트의 위조 요청을 줄이는 장치이지, 동일 OS 사용자 권한으로 실행되는 악성 프로그램을 방어하는 완전한 격리는 아니다. DB 파일 암호화는 아직 없다.

## 재사용과 의도적인 차이

원본의 Electron 창·프로세스 관리자·정책 테스트·안내 UI를 이식했다. MySQL·Kafka·Callback 비밀값 요구, 기존 JAR/미디어 경로, dev/prod 프로필 전환은 제거했다. 별도 작업실 데이터 경로와 새 DB를 사용한다. 기존 프로필 화면은 인증·SNS·파일 API 결합이 있어 첫 기능은 새 최소 화면으로 구성했다. 원본 기능 확장은 다음 단계에서 선별 이식한다.

## 근거

- [Spring Boot 3.5 시스템 요구사항](https://docs.spring.io/spring-boot/3.5/system-requirements.html)
- [H2 embedded/file 모드](https://h2database.com/html/features.html)
- [H2 백업 주의사항](https://h2database.com/html/tutorial.html): 실행 중 DB 파일 단순 복사로 백업하지 않는다.
- [Electron 보안 지침](https://www.electronjs.org/docs/latest/tutorial/security)

버전은 실제 의존성 다운로드·컴파일·테스트로 검증한다. 배포 전에는 지원 기간과 보안 업데이트를 다시 확인한다.
