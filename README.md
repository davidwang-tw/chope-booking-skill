# Chope Booking Skill (OpenClaw)

Browser-first OpenClaw skill for Chope reservation workflows.

## Recommended Positioning
- Operator-assisted restaurant booking via browser automation
- Suitable for supervised concierge/chat workflows
- Not positioned as fully autonomous high-volume booking

## Scope
- Restaurant discovery/search
- Availability checks
- Booking flow handoff via official Chope widget
- Pause/resume checkpoints for OTP and deposit approval
- Confirmation-state detection

## Why browser-first
Chope widget requests include signed parameters and browser/session context; direct raw API replay can return 401.
This skill intentionally drives the official browser flow instead of emulating backend signing.

## Flow
1. `www.chope.co` restaurant page/search
2. `book.chope.co/booking/check`
3. `booking.chope.co/widget/#/booking_check`
4. Widget states: form -> OTP/deposit (if required) -> confirmation

## Install
Place this folder under an OpenClaw workspace skill path (example):

```bash
~/.openclaw/workspace/skills/chope-booking
```

Ensure runtime dependencies:

```bash
node -v
openclaw --version
```

Optional developer checks:
```bash
npm run lint:syntax
npm test
```

## Usage
### Search
```bash
node scripts/chope_search.js --query "japanese tanjong pagar"
```
Returns `candidates[]` with best-effort structured fields (`rid`, `name`, `booking_url`, `confidence`).

### Availability probe
```bash
node scripts/chope_availability.js \
  --rid originalgreens2505sg \
  --name "Original Greens" \
  --date "2026-03-21" \
  --time "19:30" \
  --adults 2 --children 0
```

### Start booking
```bash
node scripts/chope_book.js --input ./request.json
```
Response includes `checkpoint_file` (secure temp state path).

### Resume after OTP/deposit gate
```bash
node scripts/chope_resume.js --state "<checkpoint_file>" --otp 123456
node scripts/chope_resume.js --state "<checkpoint_file>" --approve-deposit yes
```

## Status contract
All scripts output JSON:
- `success`
- `needs_user_input`
- `unavailable`
- `unknown`
- `failed`

`needs_user_input.next_action.type` may be:
- `otp`
- `payment_approval`
- `restaurant_selection`
- `time_selection`
- `manual_browser_intervention`
- `form_fill_confirmation`

When manual review is required, output may include:
- `handoff.status = "handoff_required"`
- `handoff.reason_code`
- `handoff.checkpoint_file`
- `handoff.session_id`
- `handoff.user_summary`
- `handoff.operator_actions[]`

`success` uses stronger confirmation proof and requires multiple signals (for example confirmation marker + booking reference, or equivalent).

## Safety rules
- Do not auto-complete payment/deposit without explicit user approval.
- Do not store OTP or card data.
- If captcha/anti-bot appears, pause and request manual intervention.
- Session checkpoint files are stored in temp session storage with `0600` permission and TTL cleanup.
- Duplicate-booking guardrails are enabled via idempotency fingerprinting (confirmed/in-progress intents are blocked).

## Limitations (v1)
- Conservative form-fill behavior (operator-confirmed for brittle selectors)
- DOM-first detection still depends on live page structure and may require periodic selector refresh
- Search extraction is best-effort from live page content (not a first-party structured API)
- No cancellation/modify flow yet
- No direct API signing emulation

## Remaining Production Gaps
- Fixture coverage is still partial (baseline tests/CI now added, needs expansion)
- Observability exists but is still lightweight (expand metrics/dashboarding)
- Frontend drift monitoring is not implemented yet

## Observability (Current)
- `correlation_id` is included in script outputs.
- Redacted JSONL event logs are written under `CHOPE_LOG_DIR` (or temp default).
- Basic drift-oriented counters are tracked in `metrics.json` (e.g. unknown states, empty candidates).

## References
- `references/chope_api_recon.md`
- `SKILL.md`
