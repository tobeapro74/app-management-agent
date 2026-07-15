"""
앱 관리 AI 에이전트
  morning (기본): 매일 오전 9시 — 전체 앱 health + 공시 결과 확인
  evening:        매일 오후 6시 — Dart Link 데이터 수신 결과 확인
                  (DART 공시 처리 + NPS 임직원 데이터 갱신)

실행:
  python agent.py              # morning 모드
  python agent.py --mode evening  # evening 모드
"""
import asyncio
import sys
import argparse
from pathlib import Path

# .env 파일 로드
_env = Path(__file__).parent / ".env"
if _env.exists():
    for line in _env.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            import os; os.environ.setdefault(k.strip(), v.strip())

from config import APPS, SLACK_WEBHOOK_URL
from checkers import dart_info, sajunow, yeouido, n2golf, generic
from checkers import dart_link as dart_link_checker
from checkers import dart_monitor as dart_monitor_checker
from checkers.base import CheckResult
from reporters.report import build_report, build_html_report
from reporters.slack import send_slack
from reporters.gmail import send_html_report
from api.database import init_db, save_results

# 앱 이름 → 체커 모듈 매핑
CHECKER_MAP = {
    "Dart Link": dart_link_checker,
    "Dart Monitor": dart_monitor_checker,  # 상세 DB 점검 체커로 교체
    "사주나우": sajunow,
    "여의도 한끼": yeouido,
    "N2골프": n2golf,
    "대만맛집": generic,
    "makedocu": generic,
    "HNW아카이브": generic,
}


async def run(mode: str = "morning"):
    print(f"=== 앱 점검 시작 ({mode}) ===")

    init_db()

    if mode == "evening":
        # evening: Dart Link만 데이터 수신 결과 체크
        dart_link_app = next((a for a in APPS if a.name == "Dart Link"), None)
        if not dart_link_app:
            print("[오류] Dart Link 앱 설정 없음")
            sys.exit(1)
        result = await dart_link_checker.check(dart_link_app, mode="evening")
        final: list[CheckResult] = [result]
    else:
        # morning: 전체 앱 병렬 점검
        tasks = []
        apps_with_checker = []
        for app in APPS:
            checker = CHECKER_MAP.get(app.name)
            if checker:
                tasks.append(checker.check(app))
                apps_with_checker.append(app)
            else:
                print(f"[경고] {app.name} 체커 없음 — 건너뜀")

        results = await asyncio.gather(*tasks, return_exceptions=True)

        final: list[CheckResult] = []
        for app, result in zip(apps_with_checker, results):
            if isinstance(result, Exception):
                r = CheckResult(app_name=app.name, status="error")
                r.errors.append(str(result))
                final.append(r)
            else:
                final.append(result)

    # DB 저장
    save_results([
        {
            "app_name": r.app_name,
            "status": r.status,
            "response_ms": r.response_ms,
            "details": r.details,
            "warnings": r.warnings,
            "errors": r.errors,
            "checked_at": r.checked_at,
        }
        for r in final
    ])
    print("[DB] 점검 결과 저장 완료")

    # 슬랙 리포트 (텍스트)
    report = build_report(final)
    print("\n" + report)

    sent = await send_slack(report)
    if sent:
        print("\n[Slack] 리포트 발송 완료")

    # Gmail HTML 리포트
    has_error = any(r.status == "error" for r in final)
    has_warn = any(r.status == "warn" for r in final)
    if has_error:
        prefix = "🚨 [오류]"
    elif has_warn:
        prefix = "⚠️ [경고]"
    else:
        prefix = "✅ [정상]"

    from datetime import datetime, timezone, timedelta
    now_str = datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m-%d %H:%M")
    if mode == "evening":
        subject = f"{prefix} Dart Link 데이터 수신 결과 — {now_str}"
    else:
        subject = f"{prefix} 앱관리 일일 점검 — {now_str}"

    html = build_html_report(final)
    if send_html_report(subject, html):
        print("[Gmail] 리포트 발송 완료 → tobeapro@gmail.com")

    sys.exit(1 if has_error else 0)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["morning", "evening"], default="morning",
                        help="morning: 전체 앱 점검 (09:00 KST) / evening: 데이터 수신 결과 (18:00 KST)")
    args = parser.parse_args()
    asyncio.run(run(mode=args.mode))
