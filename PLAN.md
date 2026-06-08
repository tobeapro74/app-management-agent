# 앱 관리 AI 에이전트 구축 계획

> 작성일: 2026-06-08  
> 대상 앱: Dart Info, 사주나우, 여의도맛집, N2골프

---

## 현황 파악

### 앱별 기술 스택 및 배포 환경

| 앱 | 스택 | 배포 | 특이사항 |
|---|---|---|---|
| **Dart Info** | Python (FastAPI, uvicorn) | Railway | dart_monitor 하위 모듈 구조 |
| **사주나우** | Next.js + Capacitor | Vercel | develop/main 브랜치 분리 운영 |
| **여의도맛집** | Next.js + Capacitor + iOS | Vercel | 3시간마다 리뷰 크론 자동 실행 중 |
| **N2골프** | Node.js (Express) | Vercel | 자정 예약 스케줄 크론 자동 실행 중 |

---

## 두 AI 의견 비교 및 채택 방향

### 제미나이 vs 코파일럿 핵심 차이

**제미나이**: 앱스토어 리뷰, Crashlytics 등 외부 마켓 모니터링 중심 → 사용자 피드백 루프
**코파일럿**: Health-check endpoint + 로그 분석 + 자동 PR 생성 중심 → 코드/서버 상태 루프

### 채택 방향 (현실적 우선순위)

현재 앱들은 **앱스토어 미출시** 또는 **웹앱 중심**이므로 코파일럿의 서버/코드 상태 중심 접근이 더 적합.
단, 제미나이의 데이터 자동화(DART 공시, 맛집 DB 갱신) 아이디어는 적극 채택.

---

## 에이전트 아키텍처

```
[Claude Code 스케줄러 (매일 오전 9시)]
              ↓
    [앱관리_Agent 메인 스크립트]
              ↓
    ┌─────────────────────────┐
    │    점검 태스크 병렬 실행   │
    └─────────────────────────┘
         ↓        ↓        ↓        ↓
   [Dart Info] [사주나우] [여의도맛집] [N2골프]
    Railway     Vercel    Vercel     Vercel
    health      health    health     health
    + DART API  + 배포이력  + 리뷰크론  + 스케줄크론
              ↓
    [일일 리포트 생성]
              ↓
    [Slack 또는 이메일 발송]
```

---

## 단계별 구축 로드맵

### 1단계: 기본 Health Check 인프라 (1~3일)

**목표**: 에이전트가 각 앱의 상태를 읽을 수 있는 최소 환경 구성

#### 각 앱에 추가할 작업
- **Dart Info (Railway)**: `/health` 엔드포인트 추가 (이미 FastAPI — 5분 작업)
- **사주나우 (Vercel)**: `/api/health` route 추가
- **여의도맛집 (Vercel)**: `/api/health` route 추가
- **N2골프 (Vercel)**: `/api/health` route 추가

#### health 응답 예시
```json
{
  "status": "ok",
  "app": "dart-info",
  "version": "1.0.0",
  "timestamp": "2026-06-08T09:00:00+09:00",
  "checks": {
    "db": "ok",
    "dart_api": "ok"
  }
}
```

#### 에이전트 디렉토리 구조
```
앱관리_Agent/
├── PLAN.md              (이 파일)
├── README.md
├── agent.py             (메인 에이전트 스크립트)
├── checkers/
│   ├── __init__.py
│   ├── dart_info.py     (Dart Info 점검 모듈)
│   ├── sajunow.py       (사주나우 점검 모듈)
│   ├── yeouido.py       (여의도맛집 점검 모듈)
│   └── n2golf.py        (N2골프 점검 모듈)
├── reporters/
│   ├── __init__.py
│   ├── slack.py         (Slack 발송)
│   └── report.py        (리포트 생성)
├── config.py            (URL, 키 등 설정)
├── requirements.txt
└── .env.example
```

---

### 2단계: 앱별 맞춤 점검 (4~7일)

**목표**: 단순 ping을 넘어 각 앱의 핵심 기능을 실제로 검증

| 앱 | 맞춤 점검 항목 |
|---|---|
| **Dart Info** | DART OpenAPI 연동 상태, 최근 공시 수집 여부, DB 행 수 변화 |
| **사주나우** | 사주 API 응답 정상 여부, Vercel 최근 배포 상태, develop/main 브랜치 이력 |
| **여의도맛집** | 리뷰 크론(3시간마다) 마지막 실행 시각, 맛집 DB 데이터 수 |
| **N2골프** | 자정 크론(예약 오픈) 마지막 실행 결과, 예약/회원 DB 상태 |

---

### 3단계: 일일 리포트 자동화 (1주차 완료 목표)

**목표**: 매일 오전 9시에 슬랙 또는 이메일로 리포트 발송

#### 리포트 예시
```
📊 [앱 일일 점검 리포트 - 2026.06.08]

✅ Dart Info (Railway)
  - 서버: 정상 (응답 243ms)
  - 어젯밤 수집 공시: 12건
  - DB 상태: 정상

⚠️ 사주나우 (Vercel)
  - 서버: 정상
  - 주의: develop 브랜치에 미배포 커밋 3건 있음

✅ 여의도맛집 (Vercel)
  - 서버: 정상
  - 리뷰 크론: 마지막 실행 06:00 (정상)
  - 등록 맛집: 127개

✅ N2골프 (Vercel)
  - 서버: 정상
  - 예약 크론: 마지막 실행 00:00 (정상)
  - 이번달 예약: 8건

🔧 조치 필요 사항
  1. 사주나우: develop → main 머지 검토 필요
```

---

### 4단계: Claude Code 스케줄러 연동 (2주차)

**목표**: 매일 자동 실행되도록 스케줄 등록

- `claude schedule` 기능 활용 또는 macOS `launchd` 활용
- 에이전트가 Claude Code CLI를 통해 각 체커 실행 → 리포트 생성 → 발송

---

## 즉시 시작 액션 (오늘 할 일)

1. [ ] `앱관리_Agent/` 기본 디렉토리 구조 생성
2. [ ] `config.py` 작성 (앱 URL, 환경변수 구조 정의)
3. [ ] 각 앱에 `/api/health` 엔드포인트 추가 (앱별 PR 또는 직접 커밋)
4. [ ] `agent.py` 기본 틀 작성 (병렬 health check + 콘솔 출력)
5. [ ] Slack Webhook URL 준비 (또는 이메일 대안 결정)

---

## 기술 선택 근거

- **LangChain/CrewAI 미사용**: 현재 단계에서는 과잉 설계. 단순 Python 스크립트 + httpx로 충분
- **Supabase 별도 DB 미사용**: 초기에는 JSON 파일로 이력 저장 → 필요시 업그레이드
- **GitHub Actions 미사용**: 로컬 Claude Code 스케줄러로 시작 → 추후 GitHub Actions 이전 가능
- **프레임워크 선택**: 심플한 Python asyncio + httpx (빠른 구현, 의존성 최소화)
