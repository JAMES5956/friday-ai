import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    {
      name: "FRIDAY AI",
      status: "foundation",
      message: "The web application is responding. AI services are not connected yet."
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
