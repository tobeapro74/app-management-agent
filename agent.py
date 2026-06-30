"""
앱 관리 AI 에이전트 — 매일 오전 9시 실행
각 앱의 health 엔드포인트를 병렬로 점검하고 Slack으로 리포트를 발송한다.

실행: python agent.py
"""
import asyncio
import sys
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
from checkers.base import CheckResult
from reporters.report import build_report
from reporters.slack import send_slack
from api.database import init_db, save_results

# 앱 이름 → 체커 모듈 매핑
CHECKER_MAP = {
    "Dart Link": dart_link_checker,
    "Dart Monitor": dart_info,
    "사주나우": sajunow,
    "여의도 한끼": yeouido,
    "N2골프": n2golf,
    "대만맛집": generic,
    "makedocu": generic,
    "HNW아카이브": generic,
}


async def run():
    print("=== 앱 점검 시작 ===")

    init_db()

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

    # 슬랙 리포트
    report = build_report(final)
    print("\n" + report)

    sent = await send_slack(report)
    if sent:
        print("\n[Slack] 리포트 발송 완료")

    has_error = any(r.status == "error" for r in final)
    sys.exit(1 if has_error else 0)


if __name__ == "__main__":
    asyncio.run(run())
