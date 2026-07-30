import { NextRequest, NextResponse } from "next/server";

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL ?? "";

export async function POST(req: NextRequest) {
  const { app_name, issue } = await req.json();

  if (!SLACK_WEBHOOK) {
    return NextResponse.json({ error: "SLACK_WEBHOOK_URL 미설정" }, { status: 500 });
  }

  const text = [
    `🔧 *AI 수정 지시 요청*`,
    `*앱:* ${app_name}`,
    `*감지된 문제:* ${issue}`,
    ``,
    `> 위 내용을 확인하고 수정이 필요하면 Slack에서 \`/수정\` 커맨드를 실행하세요.`,
  ].join("\n");

  try {
    const r = await fetch(SLACK_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!r.ok) {
      return NextResponse.json({ error: `Slack 발송 실패: ${r.status}` }, { status: 502 });
    }

    return NextResponse.json({
      status: "triggered",
      message: `Slack에 수정 요청을 발송했습니다. '/수정' 커맨드로 AI 수정을 실행하세요.`,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
