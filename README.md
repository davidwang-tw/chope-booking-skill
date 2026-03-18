# Chope Booking Skill (OpenClaw)

Browser-first OpenClaw skill for Chope reservation workflows.

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

## Usage
### Search
```bash
node scripts/chope_search.js --query "japanese tanjong pagar"
```

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

### Resume after OTP/deposit gate
```bash
node scripts/chope_resume.js --state ./chope_state.json --otp 123456
node scripts/chope_resume.js --state ./chope_state.json --approve-deposit yes
```

## Status contract
All scripts output JSON:
- `success`
- `needs_user_input`
- `unavailable`
- `failed`

`needs_user_input.next_action.type` may be:
- `otp`
- `payment_approval`
- `restaurant_selection`
- `time_selection`
- `manual_browser_intervention`
- `form_fill_confirmation`

## Safety rules
- Do not auto-complete payment/deposit without explicit user approval.
- Do not store OTP or card data.
- If captcha/anti-bot appears, pause and request manual intervention.

## Limitations (v1)
- Conservative form-fill behavior (operator-confirmed for brittle selectors)
- No cancellation/modify flow yet
- No direct API signing emulation

## References
- `references/chope_api_recon.md`
- `SKILL.md`
