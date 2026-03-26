# Chope Booking Skill (OpenClaw)

Browser-driven, operator-assisted Chope booking workflow for OpenClaw.

> Important: Unofficial project. Not affiliated with, endorsed by, or sponsored by Chope. Use only in authorized, policy-compliant contexts.

## Feature highlights

- Restaurant discovery/search from Chope pages
- Availability checks through official booking widget flow
- Booking flow start + resume with checkpoint handoff
- OTP/deposit pause states with explicit next-action output
- Contact profile reuse (per-user) with lifecycle controls
- Idempotency guardrails to reduce duplicate-booking risk
- Redacted observability logs and correlation IDs across all scripts
- DOM-first state detection with multi-signal confirmation
- File-locked contact profile store for concurrent safety

## Scope

- Restaurant discovery/search
- Availability checks
- Booking flow handoff via official Chope widget
- Pause/resume checkpoints for OTP and deposit approval
- Confirmation-state detection (DOM + text cross-validation)

## Why browser-driven

Chope widget requests include signed parameters and browser/session context that are not reproducible outside the browser.
This skill follows the official browser flow instead of emulating backend signing.

## Flow

1. `www.chope.co` restaurant page/search
2. `book.chope.co/booking/check`
3. `booking.chope.co/widget/#/booking_check`
4. Widget states: form -> OTP/deposit (if required) -> confirmation

## Project structure

```
scripts/
  shared.js                 # Shared utilities (arg parser, handoff builder)
  openclaw_browser.js       # Browser CLI wrapper, validation, state detection, widget URL builder
  chope_search.js           # Restaurant search via Chope pages
  chope_availability.js     # Availability probe via booking widget
  chope_book.js             # Booking orchestrator with checkpoint persistence
  chope_resume.js           # Resume workflow for OTP/deposit checkpoints
  session_state.js          # Session checkpoint save/load with TTL cleanup
  idempotency.js            # Duplicate-booking prevention via fingerprinting
  observability.js          # Redacted event logging and append-only metrics
  contact_profiles.js       # Per-user contact profile store with file locking
  contact_profiles_cli.js   # CLI for contact profile management
tests/
  openclaw_browser.test.js  # Validation and text-based state detection
  detect_state_dom.test.js  # DOM-first state detection with injected markers
  widget_url.test.js        # Widget URL builder, date/time conversion
  idempotency.test.js       # Fingerprint stability and duplicate detection
  contact_profiles.test.js  # Contact profile CRUD lifecycle
  session_state.test.js     # Session save/load/cleanup round-trips
  observability.test.js     # Correlation ID, PII redaction, logging, metrics
examples/
  sample_requests.md        # Example booking JSON payloads
references/
  chope_web_flow_notes.md   # Chope web flow technical analysis
```

## Install

Place this folder under an OpenClaw workspace skill path (example):

```bash
~/.openclaw/workspace/skills/chope-booking
```

Ensure runtime dependencies:

```bash
node -v   # Node.js 20+
openclaw --version
```

## Development

Run syntax checks and tests:

```bash
npm run lint:syntax   # Checks all 11 scripts for parse errors
npm test              # Runs 43 tests across 7 test files
```

CI runs both checks automatically on push/PR to `main` via GitHub Actions.

## Usage

All scripts output structured JSON to stdout. Every script accepts an optional `--correlation-id <id>` flag; if omitted, a UUID is generated automatically.

### Search

```bash
node scripts/chope_search.js --query "italian marina bay"
```

Returns `candidates[]` with best-effort structured fields (`rid`, `name`, `booking_url`, `confidence`).

### Availability probe

```bash
node scripts/chope_availability.js \
  --rid lavo2011sg \
  --name "LAVO Italian Restaurant And Rooftop Bar" \
  --date "2026-03-27" \
  --time "19:00" \
  --adults 2 --children 0
```

Returns the detected widget state (`success`, `unavailable`, `unknown`, etc.) and a `correlation_id` for log tracing.

### Start booking

```bash
node scripts/chope_book.js --input ./request.json
```

The request JSON should contain:

```json
{
  "restaurant": "LAVO Italian Restaurant And Rooftop Bar",
  "rid": "lavo2011sg",
  "date": "2026-03-27",
  "time": "19:00",
  "adults": 2,
  "children": 0,
  "firstName": "Alice",
  "lastName": "Tan",
  "email": "alice@example.com",
  "mobile": "+6591234567",
  "specialRequest": "Window seat if possible",
  "promoCode": ""
}
```

Optional fields for contact reuse:

| Field | Purpose |
|---|---|
| `userId` / `user_id` | Enable per-user profile storage |
| `use_saved_contact: true` | Auto-fill from default saved profile |
| `profile_id` | Use a specific saved profile |
| `save_contact: false` | Skip saving contact details for this booking |
| `availabilityOnly: true` | Check availability without starting a booking |

Response includes `checkpoint_file` (secure temp state path) for resuming the flow.

### Resume after OTP/deposit gate

```bash
# After receiving OTP
node scripts/chope_resume.js --state "<checkpoint_file>" --otp 123456

# After approving deposit
node scripts/chope_resume.js --state "<checkpoint_file>" --approve-deposit yes
```

The resume script re-opens the widget, detects the current state, and outputs the next required action.

## Contact profile reuse

Contact profile reuse is supported (per user):

- `user_id` + `use_saved_contact: true`, or
- `user_id` + `profile_id`

Profiles are auto-saved/updated when booking includes complete contact details.
Set `save_contact: false` to skip profile save/update for a booking.

Contact profile lifecycle:

- per-user scoped storage (hashed user key at rest)
- file-locked reads and writes for concurrent safety
- default retention: `180` days (`CHOPE_CONTACT_PROFILE_TTL_DAYS` configurable)
- profile management via:

```bash
node scripts/contact_profiles_cli.js --action list --user-id "<user_id>"
node scripts/contact_profiles_cli.js --action get-default --user-id "<user_id>"
node scripts/contact_profiles_cli.js --action set-default --user-id "<user_id>" --profile-id "<id>"
node scripts/contact_profiles_cli.js --action delete --user-id "<user_id>" --profile-id "<id>"
node scripts/contact_profiles_cli.js --action delete-all --user-id "<user_id>"
```

## Status contract

All scripts output JSON with a top-level `status` field:

| Status | Meaning |
|---|---|
| `success` | Booking/availability confirmed (requires 2+ DOM/text signals) |
| `needs_user_input` | Operator action required (see `next_action.type` below) |
| `unavailable` | Requested slot not available |
| `unknown` | Ambiguous DOM/text state; manual review recommended |
| `in_progress` | Widget loaded but no terminal state detected yet |
| `failed` | Unrecoverable error (bad input, runtime exception) |

`needs_user_input.next_action.type` may be:

- `otp` — verification code required
- `payment_approval` — deposit/payment confirmation needed
- `restaurant_selection` — multiple restaurant matches, confirm which one
- `time_selection` — requested time unavailable, alternative times shown
- `manual_browser_intervention` — captcha or anti-bot block
- `form_fill_confirmation` — form loaded, operator should review and fill
- `duplicate_risk` — matching booking already confirmed or in progress
- `manual_review` — ambiguous DOM/text state mismatch; manual page inspection needed
- `manual_otp_entry` — OTP value received; manual entry in browser required
- `manual_payment_continue` — deposit approval received; continue payment step in browser

When manual review is required, output may include a `handoff` object:

```json
{
  "handoff": {
    "status": "handoff_required",
    "reason_code": "ambiguous_dom_state",
    "checkpoint_file": "/tmp/chope-booking-sessions/<session>.json",
    "session_id": "<uuid>",
    "user_summary": "Manual review is required before this booking can continue safely.",
    "operator_actions": [
      "Inspect the current browser page state",
      "Confirm restaurant/date/time/party details",
      "Resume using chope_resume.js with the checkpoint file"
    ]
  }
}
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `CHOPE_STATE_DIR` | `$TMPDIR/chope-booking-sessions` | Session checkpoint and profile storage directory |
| `CHOPE_LOG_DIR` | `$TMPDIR/chope-booking-logs` | Event log and metrics output directory |
| `CHOPE_CONTACT_PROFILE_TTL_DAYS` | `180` | Contact profile retention period in days |

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

## Remaining production gaps

- Frontend drift monitoring is not implemented yet
- Idempotency ledger does not use file locking (contact profiles do)
- Metrics file (`metrics.jsonl`) grows append-only without compaction

## Observability

All scripts emit structured observability data:

- `correlation_id` is included in every script output and log entry
- Redacted JSONL event logs are written to `CHOPE_LOG_DIR/events.log`
- Append-only metric counters are written to `CHOPE_LOG_DIR/metrics.jsonl`
- PII (email, phone, name, OTP) is automatically redacted in logs
- Drift-oriented counters track unknown states and empty search results

## User-facing messaging policy

User-facing output should focus on:

- booking outcome,
- required user action,
- and next steps.

Low-level implementation details, browser workarounds, or internal detection mechanics should be kept in internal logs, handoff payloads, and operator-facing diagnostics rather than shown directly to end users.

## Privacy and data handling

This project may store limited booking contact information when saved contact reuse is enabled.
Current behavior includes:

- optional saved contact profiles for booking convenience,
- configurable retention periods (`CHOPE_CONTACT_PROFILE_TTL_DAYS`, default `180`),
- lifecycle controls for listing, updating, setting defaults, and deleting saved profiles,
- secure local storage practices for workflow state (file-locked writes, `0600` permissions).

This project is not designed to store OTP values or payment card data.

Operators should ensure that any locally stored state or contact profile data is handled securely and is not committed to version control or shared inappropriately.

For full details, see [PRIVACY.md](./PRIVACY.md).

## Compliance and responsible use

This project is intended only for lawful, authorized, and responsible use.
Users are responsible for ensuring that their use complies with:

- applicable laws and regulations,
- the terms of service and policies of any third-party platform they interact with,
- any required written permissions, affiliate approvals, or partner agreements.

This project must not be used to:

- bypass access restrictions or security controls,
- defeat captcha, OTP, payment, or anti-abuse safeguards,
- extract or collect data in ways prohibited by a platform,
- represent itself as an official or endorsed integration where no such relationship exists.

This repository is best understood as an operator-assisted workflow implementation and reference project, not a guaranteed autonomous production booking service.

## Intended use

This project is intended for:

- supervised or operator-assisted concierge workflows,
- evaluation and prototyping,
- internal tooling experiments,
- approved or permissioned integration contexts.

It is not intended to be presented as a fully autonomous, high-volume, unattended public booking bot.

## Unsupported or discouraged use

This repository is not intended for:

- mass unattended booking automation,
- circumventing platform restrictions,
- unauthorized commercial exploitation of third-party services,
- any use that conflicts with applicable platform terms or required permissions.

## Trademark notice

"Chope" and related marks are the property of their respective owners.
Any reference in this repository is for descriptive and compatibility purposes only and does not imply affiliation, endorsement, or sponsorship.

## Disclaimer

See [DISCLAIMER.md](./DISCLAIMER.md) for the full disclaimer.

## References

- [`SKILL.md`](./SKILL.md) — OpenClaw skill contract and command interface
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — Component overview and design rationale
- [`PRIVACY.md`](./PRIVACY.md) — Privacy and data handling details
- [`SECURITY.md`](./SECURITY.md) — Security notes and payment policy
- [`DISCLAIMER.md`](./DISCLAIMER.md) — Full disclaimer
- [`references/chope_web_flow_notes.md`](./references/chope_web_flow_notes.md) — Chope web flow technical analysis
- [`examples/sample_requests.md`](./examples/sample_requests.md) — Example booking JSON payloads
