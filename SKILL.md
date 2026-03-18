---
name: chope-booking
description: >
  Browser-first Chope booking automation for search, availability checks, and booking flow handoff.
  Use for requests like "book a table on Chope", "check Chope availability", "reserve at <restaurant>".
  Supports pause/resume for OTP and deposit approval states.
---

# Chope Booking Skill (Browser-first)

## Purpose
Automate Chope booking via official web flow (not direct API emulation):
1. `www.chope.co` restaurant/search page
2. `book.chope.co/booking/check`
3. `booking.chope.co/widget/#/booking_check`

## Why browser-first
Chope widget APIs are signed and can return 401 outside browser context. This skill uses browser automation and state checks.

## Inputs expected
- `restaurant` (name/slug) OR direct `restaurantUrl`
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
node scripts/chope_resume.js --state ./chope_state.json --otp 123456
# or
node scripts/chope_resume.js --state ./chope_state.json --approve-deposit yes
```

## Status contract
Scripts return JSON with:
- `success`
- `needs_user_input` (`otp`, `payment_approval`, `restaurant_selection`, `time_selection`)
- `unavailable`
- `failed`

## Safety
- Never auto-complete deposit/payment without explicit approval.
- Never store OTP or payment card data.
- If captcha/anti-bot blocks flow, return `needs_user_input` and hand off clearly.
