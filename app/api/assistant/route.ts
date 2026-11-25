import { NextResponse } from "next/server";

const MAX_BODY_BYTES = 16_384;
const MAX_MESSAGE_LENGTH = 4_000;

type AssistantPayload = {
  message?: unknown;
};

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return errorResponse(
      "UNSUPPORTED_MEDIA_TYPE",
      "Send the request as application/json.",
      415
    );
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return errorResponse(
      "REQUEST_TOO_LARGE",
      "The request is too large.",
      413
    );
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return errorResponse("INVALID_BODY", "The request body could not be read.", 400);
  }

  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return errorResponse("REQUEST_TOO_LARGE", "The request is too large.", 413);
  }

  let payload: AssistantPayload;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return errorResponse("INVALID_PAYLOAD", "Send a JSON object.", 400);
    }
    payload = parsed as AssistantPayload;
  } catch {
    return errorResponse("INVALID_JSON", "Send a valid JSON request.", 400);
  }

  if (typeof payload.message !== "string" || payload.message.trim().length === 0) {
    return errorResponse(
      "MESSAGE_REQUIRED",
      "Add a message before contacting FRIDAY.",
      400
    );
  }

  if (payload.message.length > MAX_MESSAGE_LENGTH) {
    return errorResponse(
      "MESSAGE_TOO_LONG",
      `Messages must be ${MAX_MESSAGE_LENGTH.toLocaleString()} characters or fewer.`,
      413
    );
  }

  // No model provider is configured yet. Fail closed instead of fabricating a reply.
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
