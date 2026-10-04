# Windows 설치형 앱 준비

## 현재 범위

2026-10-04: 동봉 실행 파일 경로 선택과 누락 검사, electron-builder 26.15.3 기반 NSIS 설정, Windows 런타임 다운로드/검증/manifest 생성까지 구현했다. 실제 Java/FFmpeg와 API JAR를 runtime/windows-x64에 준비했다(362개 파일, 약 490MiB). 설치 파일 생성 실행과 코드 서명, Windows 실행 검증은 아직 완료하지 않았다. 최초 대상은 Windows x64로 준비하며 ARM64는 별도 빌드/검증 전 지원하지 않는다.

개발 실행(`npm start`)은 기존 Java/PATH 및 환경변수를 사용한다. 패키징된 앱은 `app.isPackaged`로 구분하고 `process.resourcesPath` 아래 실행 파일만 선택한다. 개발용 Java/JAR/FFmpeg 경로로 대체하지 않는다. [Electron app 문서](https://www.electronjs.org/docs/latest/api/app), [process 문서](https://www.electronjs.org/docs/latest/api/process).

## 설치 결과물의 필수 구조

```text
resources/
  app.asar                     # Electron 코드 (향후 생성)
  runtime/
    api/onfilm-local.jar
    java/bin/java.exe          # Java 21 런타임 전체 디렉터리의 일부
    ffmpeg/bin/ffmpeg.exe
    ffmpeg/bin/ffprobe.exe
```

Java는 java.exe만 복사하면 안 된다. 런타임의 lib/DLL/설정 등 전체 배포 구성이 필요하다. FFmpeg도 선택한 빌드가 요구하는 DLL을 함께 넣어야 한다. 실행 파일은 app.asar 밖에 두고 shell 없이 절대 경로와 인자 배열로 실행한다. 한글/공백 경로에 따옴표 문자를 직접 붙이지 않는다.

앱 시작 시 검사는 필수 파일 존재 여부만 확인한다. 빌드 전 검사는 Java release의 21/x64 선언, jvm.dll, 고지 파일, 전체 파일 목록/해시를 추가 확인한다. 선언이나 자체 manifest는 공급자 신뢰성·바이너리 아키텍처·필요 DLL 전체·실행 가능성·코덱 지원을 보증하지 않는다. 테스트의 `.exe`는 검사 전용 가짜 파일이며 Windows 실행 테스트가 아니다.

## 빌드 입력과 명령

저장소 루트 `runtime/windows-x64/`에 위 runtime 내부 구조 전체를 준비한다. 이 디렉터리는 Git에서 제외된다. `THIRD-PARTY-NOTICES.txt`와 원래 배포본의 라이선스 파일들을 보존하고, 아래 형식의 `runtime-manifest.json`에 manifest 자체를 제외한 모든 파일의 상대 경로와 SHA-256을 기록한다. 출처/배포 버전/원본 다운로드 해시도 `sources`에 기록한다. `prepare:windows-runtime`이 이를 자동 생성한다.

개발자 준비 명령(먼저 backend의 verificationBuild로 JAR 빌드):

```sh
cd desktop
npm run prepare:windows-runtime
# 다른 JAR를 명시하려면:
# npm run prepare:windows-runtime -- /absolute/path/to/onfilm-local.jar
npm run check:windows-runtime
```

준비 스크립트는 시스템에 Java/FFmpeg를 설치하거나 실행하지 않는다. Git에 기록된 `scripts/windows-runtime-lock.json`의 URL/해시로 ZIP을 검증한 뒤 별도 staging에 추출한다. ZIP 링크·경로 탈출·Windows 예약 이름·크기/파일 개수 초과를 거부하며 원래 배포 폴더 전체를 보존한다. 고정된 공급자 체크섬과 비교하지만 서명 검증은 수행하지 않는다.

현재 입력은 Temurin JRE 21.0.12.1+1 및 Gyan FFmpeg essentials 9.0.2이다. FFmpeg URL은 최신 릴리스 별칭이므로 내용이 바뀌면 고정 해시와 불일치하여 중단된다. 자동으로 새 체크섬을 신뢰하지 않는다. 버전 변경은 배포 출처를 다시 확인하고 lock 파일을 검토해 갱신한다.

기존 windows-x64 폴더는 덮어쓰지 않는다. 재준비 시 기존 결과를 사용자가 별도 보관한 뒤 실행해야 한다. 준비 중 실패한 `runtime/prepare-windows-*`와 원본 ZIP은 자동 삭제하지 않는다. 최종 폴더 게시 중 중단되면 불완전 폴더가 남을 수 있으므로 검사 실패 상태로 두고 수동 확인한다. 이번 준비 원본: `runtime/prepare-windows-YMv2rV/`(ZIP 약 156MiB). 준비 당시 API JAR의 복사본이므로 이후 코드 수정만으로 동봉 JAR가 갱신되지는 않는다.

### 라이선스 검토 상태

Java의 NOTICE/legal 디렉터리와 FFmpeg의 LICENSE/README/doc를 그대로 포함했다. Gyan 배포는 libx264를 포함한 GPLv3 빌드다. 고지 파일 복사만으로 재배포 의무 검토가 끝난 것은 아니다. 다른 사람에게 설치 파일을 전달하기 전 해당 바이너리에 대응하는 소스·빌드 정보 및 외부 라이브러리 의무를 확인해야 한다. 현재 번들은 개발/테스트용이며 앱 전체에 적용되는 라이선스를 여기서 단정하지 않는다. [Gyan 배포 정보](https://www.gyan.dev/ffmpeg/builds/), [FFmpeg 라이선스 안내](https://ffmpeg.org/legal.html).

```json
{
  "platform": "win32",
  "arch": "x64",
  "sources": {"java": "출처·버전·배포본 해시", "ffmpeg": "출처·버전·배포본 해시"},
  "files": [{"path": "api/onfilm-local.jar", "sha256": "실제 64자리 SHA-256"}]
}
```

위 예시는 형식 설명이며 실행 가능한 완성 manifest가 아니다. Java/FFmpeg의 나머지 파일도 모두 기록해야 한다.

Windows에서 desktop 디렉터리 기준:

```powershell
npm ci
npm run check:windows-runtime
npm run pack:win
# 풀린 앱을 실행해 검증한 다음 설치 파일 생성
npm run dist:win
```

결과는 `desktop/dist/`에 생성하도록 설정했다. `pack:win`은 설치 전 폴더 형태, `dist:win`은 NSIS 설치 파일이다. 패키징 훅은 macOS/Linux에서 Windows 최종 빌드를 거부한다. 현재 Mac에 준비한 런타임의 사전 검사는 통과했다. Windows로 소스를 가져갈 때 Git 제외된 runtime 폴더를 별도 전달하거나 준비 스크립트를 다시 실행해야 한다. `--publish never`로 업로드는 수행하지 않는다.

설치 설정은 사용자별 설치, 바탕화면/시작 메뉴 바로가기 생성, 설치 완료 후 자동 실행 안 함, 제거 시 앱 데이터 자동 삭제 안 함이다. 이 옵션들의 실제 Windows 설치/제거 동작은 검증 전이다. 포함 소스는 `src/`와 package.json, 별도 리소스는 지정 runtime 폴더로 제한한다. runtime에 링크·DB·환경 파일·미등록 파일이 있으면 거부한다. 서명되지 않은 개발용 설치본은 SmartScreen 경고가 날 수 있으며 배포 전 별도 확인한다.

설정 참고: [electron-builder 구성](https://www.electron.build/configuration/), [NSIS 설정](https://www.electron.build/nsis/).

DB와 사용자 미디어는 기존 OS 사용자 데이터 폴더에 유지한다. 설치 폴더에 넣거나 빌드 결과에 포함하지 않는다. 기존 사용자 데이터를 초기화/이관하지 않는다. 실행별 토큰/Host/Origin 및 단일 실행 잠금은 유지한다.

## 다음 구현 순서

1. Windows x64 Java 21 런타임과 FFmpeg/ffprobe 배포본의 출처·버전·해시·라이선스/고지 자료 확정. 자동 다운로드나 시스템 설치는 아직 하지 않는다.
2. 설치 파일 생성 도구 및 고정 버전 구성. 코드와 별도 runtime 파일만 포함하고 DB/미디어/테스트 데이터/비밀값은 제외.
3. Windows에서 각 바이너리 실행, Java API 시작·FFmpeg 인코딩 및 HLS 재생 확인. Mac 파일을 Windows 런타임으로 사용하지 않는다.
4. 개발 도구/Java/FFmpeg를 설치하지 않은 Windows 사용자 계정에서 설치→아이콘 실행→편집→종료→재시작 검증.
5. 앱 업데이트/제거 후 사용자 데이터 보존, 종료 중 인코딩, 포트 충돌, 백업·복원, ZIP/휴지통, 한글 경로, 설치 권한, 백신/SmartScreen 확인.

특히 Windows 프로세스 종료 방식에 따라 JVM 종료 훅 동작이 달라질 수 있으므로, 인코딩 중 종료 및 백업 전 정상 종료는 Windows 실기기로 검증해야 한다. Mac에서 통과했다는 이유로 안전한 종료를 보장하지 않는다.

## 검증 명령

개발 앱의 JAR를 덮어쓰지 않는 검증용 빌드:

```sh
cd backend
./gradlew -PverificationBuild check bootJar
cd ../desktop
npm test
ONFILM_TEST_JAR=/절대경로/onfilm-local/backend/build-verification/libs/onfilm-local.jar npm run test:e2e
```

마지막 명령은 macOS 셸 예시다. Windows 검증에서는 PowerShell 환경변수 지정 및 실제 Windows 런타임을 사용한다.
