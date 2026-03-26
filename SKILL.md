---
name: chope-booking
description: >
  Browser-driven, operator-assisted Chope booking workflow for search, availability checks, and booking flow handoff.
  Use for requests like "book a table on Chope", "check Chope availability", "reserve at <restaurant>".
  Supports pause/resume for OTP and deposit approval states.
---

# Chope Booking Skill (Browser-driven)

## Purpose
Run an operator-assisted Chope booking workflow via the official web flow (not direct API emulation):
1. `www.chope.co` restaurant/search page
2. `book.chope.co/booking/check`
3. `booking.chope.co/widget/#/booking_check`

This skill is unofficial and should be used only in authorized, policy-compliant contexts.

## Why browser-driven
Chope widget requests require browser/session context that cannot be reliably replicated outside the browser. This skill uses browser automation and state checks.

## Inputs expected
- `restaurant` (name/slug)
- `date` (e.g. `2026-03-21`)
- `time` (e.g. `19:30`)
- `adults` (int)
- `children` (int, default 0)
- optional `specialRequest`
- optional `promoCode`

## Commands

### 1) Search restaurants
```bash
node scripts/chope_search.js --query "japanese tanjong pagar"
```

### 2) Check availability (widget entry)
```bash
node scripts/chope_availability.js \
  --rid originalgreens2505sg \
  --name "Original Greens" \
  --date "2026-03-21" \
  --time "19:30" \
  --adults 2 --children 0
```

### 3) Start booking flow
```bash
node scripts/chope_book.js --input ./request.json
```

### 4) Resume booking after OTP/payment approval
```bash
node scripts/chope_resume.js --state "<checkpoint_file>" --otp 123456
# or
node scripts/chope_resume.js --state "<checkpoint_file>" --approve-deposit yes
```

## Status contract
Scripts return JSON with a top-level `status` field:
- `success` — booking/availability confirmed
- `needs_user_input` — operator action required (`otp`, `payment_approval`, `restaurant_selection`, `time_selection`, `manual_browser_intervention`, `form_fill_confirmation`, `duplicate_risk`)
- `unavailable` — requested slot not available
- `failed` — unrecoverable error (bad input, runtime exception)
- `unknown` — ambiguous DOM/text state; manual review recommended
- `in_progress` — widget loaded but no terminal state detected yet

When `status` is `unknown` or `needs_user_input`, the response may include a `handoff` object:
- `handoff.status`: `handoff_required`
- `handoff.reason_code`: e.g. `ambiguous_dom_state`, `manual_step_required`
- `handoff.checkpoint_file`: path to the session checkpoint file
- `handoff.operator_actions`: list of recommended manual steps

## Safety
- Never auto-complete deposit/payment without explicit approval.
- Never store OTP or payment card data.
- If captcha/anti-bot blocks flow, return `needs_user_input` and hand off clearly.
