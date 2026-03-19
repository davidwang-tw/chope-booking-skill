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
- Redacted observability logs and correlation IDs for operators

## Scope

- Restaurant discovery/search
- Availability checks
- Booking flow handoff via official Chope widget
- Pause/resume checkpoints for OTP and deposit approval
- Confirmation-state detection

## Why browser-driven

Chope widget requests include signed parameters and browser/session context; direct raw API replay can return `401`.
This skill follows the official browser flow instead of emulating backend signing.

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

## Contact profile reuse

Contact profile reuse is supported (per user):

- `user_id` + `use_saved_contact: true`, or
- `user_id` + `profile_id`

Profiles are auto-saved/updated when booking includes complete contact details.
Set `save_contact: false` to skip profile save/update for a booking.

Contact profile lifecycle:

- per-user scoped storage (hashed user key at rest)
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

## Remaining production gaps

- Fixture coverage is still partial (baseline tests/CI now added, needs expansion)
- Observability exists but is still lightweight (expand metrics/dashboarding)
- Frontend drift monitoring is not implemented yet

## Observability (current)

- `correlation_id` is included in script outputs.
- Redacted JSONL event logs are written under `CHOPE_LOG_DIR` (or temp default).
- Basic drift-oriented counters are tracked in `metrics.json` (for example unknown states and empty candidates).

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
- secure local storage practices for workflow state.

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
- scrape or harvest data in ways prohibited by a platform,
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

- `references/chope_api_recon.md`
- `SKILL.md`
