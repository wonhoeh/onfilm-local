# 로컬 HLS 재생 (2026-09-28)

## 화면과 진입

- 기존 OnFilm `video-player.html`/`video-player.css`를 선별 재사용. 뒤로가기·작품 제목·영상·시간·타임라인·하단 재생/10초 이동/볼륨/배속/전체 화면 구성 유지.
- 외부 CDN, 인라인 스타일, 서버형 인증/URL 로직 대신 로컬 전용 JS와 CSS 보완. 조작부 키보드 접근, 타임라인 방향키/Home/End 지원.
- 사용자 보완 요청: 작품 카드/영상 보기로 열면 소리 있는 자동재생을 한 번 시도한다. 로컬 Electron 창에만 autoplayPolicy를 설정하며 외부 이동 차단은 유지한다. 탐색/버퍼링 후 canplay가 재발생해도 사용자의 일시정지를 해제하지 않는다. 차단된 환경은 재생 버튼 안내.
- Space/K 재생·정지, ←/→ 5초 이동, ↑/↓ 볼륨 5%, F 전체 화면, M 음소거. 입력 요소의 기본 키 동작은 유지하고, 포커스된 조작부에서 처리한 키는 중복 실행하지 않는다.
- Electron 권한은 기본 거부를 유지하되 동일 webContents·동일 origin의 `/video-player.html` 메인 프레임에만 `fullscreen`을 허용한다. `automatic-fullscreen`, 카메라/마이크, 위치 등의 권한은 여전히 거부한다. 재생 자동시작 정책은 브라우저 권한 허용과 별개다.
- 카드 hover 확대 유지, 강조색 테두리 제거. 키보드 focus-visible은 흰색으로 유지한다.

## 재생 바 커서 미리보기

- `timeline-preview.js`의 별도 음소거·정지 video/HLS 인스턴스가 해당 위치를 읽는다. 본 영상의 currentTime/paused에는 접근해 변경하지 않는다. 기존 DONE 영상 재인코딩이나 DB 변경이 필요 없다.
- 실제 pointer 이동 시에만 초기화. 100ms 이동 합치기, 진행 중 seek 완료 후 최신 위치만 적용, 결과 준비 전 로딩 안내와 시간 표시. 화면 가장자리에서 팝업 위치 제한.
- 커서를 떼면 로딩 중지, 재진입 시 재개. 재조회/화면 종료/본 영상 오류 시 인스턴스 정리. 미리보기만 실패하면 본 영상은 유지하고 재진입 시 재시도한다.
- 이미 생성된 최대 720p HLS를 추가 디코딩하는 구현이다. 장편에서 별도 썸네일 sprite보다 CPU/디스크 사용이 클 수 있으며 장시간 부하는 후속 검증한다.
- 필모그래피 편집의 완료된 영상 보기, 프로필 작품 카드에서 진입. 미저장 편집이 있으면 먼저 저장하도록 안내.
- 로딩 시간 초과·파일 누락·치명적 HLS 오류 시 재생 중지 및 다시 읽기. 뒤로가기는 프로필로 돌아간다.

## 데이터와 보안

- `GET /api/videos/{videoId}/playback`: 현재 작품에 연결된 READY 영상 + DONE 작업만 작품 제목/상대 manifest URL 반환.
- `GET /api/videos/{videoId}/hls/{name}`: 같은 조건을 매번 확인하고 해당 완료 attempt 파일만 제공. `index.m3u8`, `segment-숫자.ts`만 허용. 다른 경로, 존재하지 않는 파일, 관리 디렉터리 아래 심볼릭 링크 거부. 사용자 데이터 루트 자체의 OS 경로 별칭은 허용.
- `FileSystemResource` 스트리밍 및 HTTP Range 지원. 영상 전체를 byte 배열로 올리지 않는다. MIME은 manifest `application/vnd.apple.mpegurl`, TS `video/mp2t`.
- 기존 loopback + 실행별 토큰 + Host/Origin 검사 유지. DB/원본 경로 노출 없음. 연결을 해제해도 이미 브라우저에 버퍼링된 데이터까지 즉시 지우는 기능은 아니다.
- CSP에 `media-src 'self' blob:`만 추가. MSE 재생용이며 외부 script/connect 및 Node 접근은 허용하지 않는다.

## HLS.js 포함 방식

- `desktop/package.json`/lock에 `hls.js` 1.7.3 고정. 배포용 `dist/hls.min.js`와 Apache-2.0 LICENSE를 `backend/src/main/resources/static/vendor/hls.js`로 복사하여 JAR에 포함. 런타임 npm/CDN 요청 없음.
- 갱신 시 package/lock과 static 복사본·라이선스를 함께 갱신한다. sourcemap은 배포하지 않는다.
- [공식 사용 예제](https://github.com/video-dev/hls.js/blob/master/demo/basic-usage.html)의 `isSupported`, `loadSource`, `attachMedia` 흐름을 사용.
- [공식 설정 문서](https://github.com/video-dev/hls.js/blob/master/docs/API.md#enableworker)에 따라 `enableWorker: false`로 설정. 기존 Electron의 현재 webContents 전용 네트워크 인증 범위를 확장하지 않는다. 장시간 영상에서 메인 스레드 부하는 후속 검증 대상.

## 검증 범위

- 임시 파일 H2 + 실제 FFmpeg: 완료 전 거부, manifest/segment 조회, 경로 거부, 재시작 후 조회, 연결 해제 후 거부.
- Electron E2E: 12초 H.264/AAC 합성 영상 → HLS 변환 → 실제 decode/재생 → 여러 segment를 가로지르는 10초 탐색 → 배속 → 프로필에서 진입 → manifest 누락/복원 후 다시 읽기. 무인증 403 및 segment Range 응답 확인.
- 보완 E2E 통과: 편집/프로필에서 소리 있는 자동재생(음소거 설정 false 확인), Space/좌우/음소거/볼륨 키, F 전체 화면 진입/복귀, 포커스된 재생 버튼 Space 중복 방지, 커서 이동 시 미리보기 위치 갱신 및 본 영상 위치/일시정지 불변, leave 숨김. 화면 캡처 확인. 실제 스피커 청취 검증은 아님. Node 권한 테스트 포함 13개 통과.
- 백엔드 check/bootJar, Node 12개, 위 Electron E2E 및 기존 기능 회귀 검증 통과. 캡처로 기존 재생 화면 배치를 확인했다. 결과는 `development-plan.md`에도 기록했다. Windows/실제 장편/고비트레이트 영상/스피커 청취/전체 화면·볼륨 수동 조작은 아직 검증하지 않았다.
- 공개본 내보내기·호스팅·썸네일 자동 추출·작업 완료 알림·Windows FFmpeg 동봉은 이번 범위 밖이다.
