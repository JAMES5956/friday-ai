# FRIDAY telephone system

## Current implementation

The application includes a Twilio-compatible telephone adapter with:
- Signed inbound-call webhooks.
- Speech recognition and spoken AI responses for callers.
- A strict caller-facing prompt that identifies FRIDAY as Victor's assistant and refers to the owner as Victor.
- No caller access to owner memories, private schedule, location, or personal information.
- No audio recording and no automatic message-delivery claims.
- Encrypted, short-lived conversation state carried between signed provider callbacks; caller transcripts are not written to the database.
- An owner-authenticated, explicitly confirmed test call to the one configured owner number.
- NEXUS audit logging before an owner test call is placed.
- Fail-closed behaviour when provider credentials, encryption, model access, or webhook verification are unavailable.

## Provider setup required

Real calls are not active by default. Before enabling:
1. Choose and approve a telephony provider and its pricing, data-processing and retention terms. The first adapter currently targets Twilio; no account or paid service is created automatically.
2. Obtain a provider account, a voice-capable phone number and credentials.
3. Set `FRIDAY_TELEPHONY_ENABLED=true` only after approval.
4. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, and `FRIDAY_OWNER_PHONE` as server-side secrets.
5. Set `FRIDAY_PUBLIC_BASE_URL` to the public HTTPS origin. Configure the provider's incoming voice webhook to POST to `/api/telephony/incoming`.
6. Configure the approved AI provider and `FRIDAY_DATA_ENCRYPTION_KEY`; callers' speech is sent to the configured AI model provider for response generation.
7. Verify provider signatures, inbound and outbound calls, speech recognition, voice quality, timeouts, mobile network behaviour, and audit events before enabling for normal use.

Use E.164 phone numbers, for example `+2547XXXXXXXX`. Never commit credentials or paste them into chat.

## Current limits

- The initial adapter is Twilio-specific; the application-facing design keeps provider code isolated for future adapters.
- The caller assistant can answer general questions but cannot access Victor's personal data or perform actions.
- It does not yet persist caller messages or promise callbacks.
- The owner test call is implemented. The daily 8:00 AM briefing call is not yet scheduled because the personal/company calendar and schedule feed are not yet implemented.
- A Twilio account and number are external requirements; GitHub CI cannot test a real phone call.
- Twilio speech recognition and voice selection depend on the account, supported languages, region and provider availability. The default language/voice are configurable and must be tested with Kenyan callers.
- This implementation does not record audio. Provider-side processing and retention are governed by the provider's terms and account settings.

## Security

- All provider webhooks must include a valid Twilio signature and match the configured account SID.
- The canonical public HTTPS origin is configured explicitly to avoid trusting arbitrary forwarded host headers.
- Callers are untrusted and never receive owner memory or calendar context.
- Call state is encrypted using the existing application encryption key and bounded to eight conversational turns.
- Outbound test calls are restricted to the configured owner number and require an authenticated owner request with explicit confirmation.
