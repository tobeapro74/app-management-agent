import { NextRequest, NextResponse } from "next/server";

const DM_API = "https://api.dart-monitor.com";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const path   = searchParams.get("path") ?? "health";
  const period = searchParams.get("period");
  const limit  = searchParams.get("limit");

  const url = new URL(`${DM_API}/${path}`);
  if (period) url.searchParams.set("period", period);
  if (limit)  url.searchParams.set("limit",  limit);

  try {
    const res  = await fetch(url.toString(), { next: { revalidate: 60 } });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
