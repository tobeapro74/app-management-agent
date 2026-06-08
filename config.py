import os
from dataclasses import dataclass, field

@dataclass
class AppConfig:
    name: str
    base_url: str
    health_path: str = "/api/health"

    @property
    def health_url(self):
        return f"{self.base_url}{self.health_path}"


APPS: list[AppConfig] = [
    AppConfig(
        name="Dart Info",
        base_url=os.getenv("DART_INFO_URL", "https://web-production-1e769.up.railway.app"),
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
