"""Gmail 발송 모듈 — tobeapro@gmail.com 계정 사용."""
import base64
import os
import pickle
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

TOKEN_FILE = Path.home() / ".calsync_token.pkl"
REPORT_TO = os.getenv("REPORT_TO", "tobeapro@gmail.com")


def _gmail_service():
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build

    if not TOKEN_FILE.exists():
        raise RuntimeError("Gmail OAuth 토큰 없음. 메일관리_Agent에서 재인증 필요.")
    with open(TOKEN_FILE, "rb") as f:
        creds = pickle.load(f)
    if not creds.valid:
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(TOKEN_FILE, "wb") as f:
                pickle.dump(creds, f)
        else:
            raise RuntimeError("Gmail 토큰 만료. 재인증 필요.")
    return build("gmail", "v1", credentials=creds)


def send_html_report(subject: str, html_body: str) -> bool:
    """HTML 이메일을 tobeapro@gmail.com으로 발송. 성공 시 True."""
    try:
        svc = _gmail_service()
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["To"] = REPORT_TO
        msg["From"] = "me"
        msg.attach(MIMEText(html_body, "html", "utf-8"))
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        svc.users().messages().send(userId="me", body={"raw": raw}).execute()
        return True
    except Exception as e:
        print(f"[Gmail] 발송 실패: {e}")
        return False
