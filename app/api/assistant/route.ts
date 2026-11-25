import { NextResponse } from "next/server";

const MAX_MESSAGE_LENGTH = 4_000;

type AssistantPayload = {
  message?: unknown;
};

export async function POST(request: Request) {
  let payload: AssistantPayload;

  try {
    payload = (await request.json()) as AssistantPayload;
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Send a valid JSON request." } },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (typeof payload.message !== "string" || payload.message.trim().length === 0) {
    return NextResponse.json(
      {
        error: {
          code: "MESSAGE_REQUIRED",
          message: "Add a message before contacting FRIDAY."
        }
      },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (payload.message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      {
        error: {
          code: "MESSAGE_TOO_LONG",
          message: `Messages must be ${MAX_MESSAGE_LENGTH.toLocaleString()} characters or fewer.`
        }
      },
      { status: 413, headers: { "Cache-Control": "no-store" } }
    );
  }

  // The API contract is in place. A model provider must be configured before
  // this endpoint can generate an actual assistant response.
  return NextResponse.json(
    {
      error: {
        code: "AI_PROVIDER_NOT_CONFIGURED",
        message: "FRIDAY's intelligence service is not connected yet."
      },
      available: false
    },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  );
}
