# OnFilm Local 작업 규칙

- 이 저장소는 1인용 Electron + Spring Boot 로컬 앱이다. 기존 서버형 OnFilm과 Worker 저장소는 읽기·선별 재사용 대상으로만 취급한다.
- 사용자의 기존 DB·사진·영상을 초기화하거나 자동 이관하지 않는다. 운영/원본 MySQL에 연결하지 않는다.
- 파일형 H2가 실제 앱 DB다. 메모리 DB 테스트만으로 영속화 검증을 대체하지 않는다.
- 스키마는 Flyway versioned SQL로 관리한다. 이미 적용된 마이그레이션 수정 대신 새 버전을 추가한다.
- 현재 저장 계층은 Spring JDBC다. Kafka·분산 Outbox/Inbox·별도 Worker 서버를 추가하기 전 설계 범위를 사용자와 확인한다.
- Electron renderer는 sandbox/context isolation을 유지하고 Node 접근을 금지한다. IPC는 제한된 메서드와 발신자 검증을 사용한다.
- 로컬 API는 loopback + 실행별 토큰 + Host/Origin 검사를 유지한다. 토큰이나 실제 비밀값을 Git·로그·URL에 넣지 않는다.
- 서버 프로세스는 shell 없이 인자 배열로 실행하고, 자신이 생성한 자식만 정리한다.
- 데이터는 설치 폴더 밖의 앱 사용자 데이터 폴더에 보관한다. DB를 사용하는 테스트는 임시 폴더만 사용한다.
- 관련 변경 후 backend에서 `./gradlew check bootJar`, desktop에서 `npm test`, GUI 가능 시 `npm run test:e2e`를 실행한다.
- macOS 결과를 Windows 검증으로 표현하지 않는다. 미검증 항목과 다음 작업을 `docs/development-plan.md`에 기록한다.
