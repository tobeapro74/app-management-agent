import os
from dataclasses import dataclass, field
from urllib.parse import urlparse

@dataclass
class AppConfig:
    name: str
    base_url: str
    health_path: str = "/api/health"

    @property
    def health_url(self):
        return f"{self.base_url}{self.health_path}"

    @property
    def hostname(self) -> str:
        return urlparse(self.base_url).hostname or ""


APPS: list[AppConfig] = [
    AppConfig(
        name="Dart Link",
        base_url=os.getenv("DART_LINK_URL", "https://api.dartlinkpro.com"),
        health_path="/health",
    ),
    AppConfig(
        name="Dart Monitor",
        base_url=os.getenv("DART_MONITOR_URL", "https://api.dart-monitor.com"),
        health_path="/health",
    ),
    AppConfig(
        name="사주나우",
        base_url=os.getenv("SAJUNOW_URL", "https://saju-now.vercel.app"),
    ),
    AppConfig(
        name="여의도 한끼",
        base_url=os.getenv("YEOUIDO_URL", "https://yeouido-food.vercel.app"),
    ),
    AppConfig(
        name="N2골프",
        base_url=os.getenv("N2GOLF_URL", "https://n2golf.vercel.app"),
    ),
    AppConfig(
        name="대만맛집",
        base_url=os.getenv("TAIWAN_URL", "https://taiwan-food-nextjs.vercel.app"),
    ),
    AppConfig(
        name="makedocu",
        base_url=os.getenv("MAKEDOCU_URL", "https://makedocu.vercel.app"),
    ),
    AppConfig(
        name="HNW아카이브",
        base_url=os.getenv("HNW_URL", "https://hnw-archive.vercel.app"),
    ),
]

SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL", "")
REPORT_HOUR_KST = 9  # 매일 오전 9시
REQUEST_TIMEOUT = 10  # 초
