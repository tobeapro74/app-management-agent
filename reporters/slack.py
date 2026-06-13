import httpx
from config import SLACK_WEBHOOK_URL


async def send_slack(text: str) -> bool:
    if not SLACK_WEBHOOK_URL:
        print("[Slack] SLACK_WEBHOOK_URL 미설정 — 콘솔 출력만 수행")
        return False
    print(f"[Slack] 발송 시도: {SLACK_WEBHOOK_URL[:50]}...")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                SLACK_WEBHOOK_URL,
                json={"text": text},
                timeout=10,
            )
        print(f"[Slack] 응답 코드: {resp.status_code}, 본문: {resp.text[:100]}")
        return resp.status_code == 200
    except Exception as e:
        print(f"[Slack] 발송 실패: {e}")
        return False
