# Chope booking web-flow notes

Scope: high-level analysis of Chope's public web flows to inform the design of a browser-driven booking skill.

## Summary

Chope's public restaurant pages do **not** submit bookings directly from `www.chope.co`.
They launch a separate SPA booking widget.

High-level flow:
1. User starts on a restaurant page under `www.chope.co`.
2. Page opens `https://book.chope.co/booking/check?...` via a standard HTML form.
3. That redirects into a SPA route under `https://booking.chope.co/widget/#/booking_check?...`.
4. The widget collects diner details, validates mandatory checkboxes/custom questions, may require OTP, may require deposit payment, and finally creates the booking.

---

## Why browser automation

- The booking widget uses signed request parameters that require browser/session context.
- Requests made outside the browser context are rejected.
- The widget loads reCAPTCHA and OTP verification flows.
- A fully headless or direct-API approach would be brittle and would risk bypassing platform safeguards.

For these reasons, this skill uses browser automation to follow the official widget flow rather than attempting to replicate internal request signing.

---

## Public page findings

Restaurant page example:
- `https://www.chope.co/singapore-restaurants/restaurant/original-greens`

Observed booking form on restaurant page:
- HTML form action: `https://book.chope.co/booking/check`
- method: `GET`
- hidden inputs: `date`, `name`, `time`, `adults`, `children`, `rid`, `source`, `redirect`

Example form payload:
```text
GET https://book.chope.co/booking/check
  ?date=18+Mar+2026
  &name=Original+Greens
  &time=12%3A30+pm
  &adults=2
  &children=0
  &rid=originalgreens2505sg
  &source=chope.com.sg
  &redirect=1
```

Redirect target:
```text
https://booking.chope.co/widget/#/booking_check
  ?date=18%20Mar%202026
  &name=Original%20Greens
  &time=12%3A30%20pm
  &adults=2
  &children=0
  &rid=originalgreens2505sg
  &source=chope.com.sg
  &redirect=1
  &lang=en_US
  &country_code=SG
```

---

## Widget UI fields

The booking widget renders these user-facing fields:
- First Name
- Last Name
- Email address
- Mobile number (+ country code picker)
- Marketing consent checkboxes
- Special requests
- Promo code
- Reservation policy checkbox
- Book table button

Additional widget capabilities observed:
- Allergies / dietary preferences
- Special occasions
- Custom questions
- OTP verification
- Deposit / pay-now flow

---

## Widget states

The widget transitions through several states that the skill detects:

| State | Trigger |
|---|---|
| Form loaded | Initial widget render |
| OTP required | Mobile verification step triggered |
| Deposit/payment | Restaurant requires prepayment |
| Booking confirmed | Successful reservation with reference |
| No availability | Requested slot not available |
| Captcha/anti-bot | reCAPTCHA or challenge presented |

---

## Design conclusion

The browser-driven approach was chosen because:

1. The booking widget relies on signed parameters and browser session context that cannot be reliably reproduced outside the browser.
2. OTP, deposit, and reCAPTCHA flows require user interaction that a direct API client cannot handle without bypassing safeguards.
3. Browser automation follows the official user-facing flow, avoiding any unauthorized API usage.

This skill does not call, replicate, or reverse-engineer any internal Chope APIs. It interacts exclusively through the public browser-facing widget.
