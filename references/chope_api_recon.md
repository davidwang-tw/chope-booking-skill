# Chope booking API reconnaissance

Date: 2026-03-18
Scope: light reverse-engineering of Chope's public web flows for https://www.chope.co/singapore-restaurants and the booking widget hosted at `booking.chope.co`.

## Summary

Chope's public restaurant pages do **not** submit bookings directly from `www.chope.co`.
They launch a separate SPA booking widget.

High-level flow discovered:
1. User starts on a restaurant page under `www.chope.co`.
2. Page opens `https://book.chope.co/booking/check?...`.
3. That redirects into a SPA route under `https://booking.chope.co/widget/#/booking_check?...`.
4. The widget calls multiple signed JSON endpoints on `api.chope.co` and `openapi.chope.co`.
5. The widget collects diner details, validates mandatory checkboxes/custom questions, may require OTP, may require deposit payment, and finally creates the booking.

This is enough to design an OpenClaw skill for:
- restaurant discovery/search
- availability lookup
- reservation preparation / deep-link handoff
- supervised booking assistance later

It is **not yet enough** for a clean unsupported server-to-server booking client, because request signing and final booking endpoints still need more extraction.

---

## Important constraints

- `robots.txt` blocks broad crawling; keep scraping light and targeted.
- Widget API calls include `t=` and `sign=` parameters.
- Calling these endpoints directly from a fresh server-side client returned `401 Not authorized` during recon.
- The same endpoints worked from the live browser widget context, which suggests one or more of:
  - signed request verification
  - origin / referer checks
  - cookies / session bootstrap
  - anti-bot controls
- The booking widget loads Google reCAPTCHA and OTP verification flows, so a fully headless booking skill will likely be brittle unless implemented as browser automation.

---

## Public page findings

Restaurant page example:
- `https://www.chope.co/singapore-restaurants/restaurant/original-greens`

Observed booking form on restaurant page:
- HTML form action: `https://book.chope.co/booking/check`
- method: `GET`
- hidden inputs discovered:
  - `date`
  - `name`
  - `GTM_RestaurantUID`
  - `GTM_RestaurantName`
  - `time`
  - `adults`
  - `children`
  - `rid`
  - `source`
  - `redirect`
  - `partner_source`
  - `reservation_charge`

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
  &partner_source=
  &reservation_charge=
```

Redirect observed:
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

## Widget UI fields discovered

The booking confirmation/check page renders these user-facing fields:
- First Name
- Last Name
- Email address
- Mobile number (+ country code picker)
- marketing consent checkboxes
- Special requests
- Promo code
- reservation policy checkbox
- Book table button

Additional widget capabilities inferred from JS:
- allergies / dietary preferences
- special occasions
- custom questions
- promo codes
- OTP verification
- deposit / pay-now flow
- login/signup / loyalty integration
- cancellation / edit / waitlist routes

---

## Confirmed API surfaces

These endpoints were observed from browser network resources after loading the widget.

### 1) Page bootstrap / booking context
Endpoint:
```text
GET https://api.chope.co/widget_use/loadpage_vars
```
Observed query params:
- `adults`
- `rid`
- `lang`
- `country_code`
- `source`
- `date`
- `time`
- `select_location`
- `section_id`
- `smart`
- `name`
- `children`
- `redirect`
- `new_widget_use`
- `seating`
- `from=widget_vue`
- `t`
- `sign`

Observed example:
```text
https://api.chope.co/widget_use/loadpage_vars?adults=2&rid=originalgreens2505sg&lang=en_US&country_code=SG&source=chope.com.sg&date=18+Mar+2026&time=12:30+pm&select_location=0&section_id=&smart=1&name=Original+Greens&children=0&redirect=1&new_widget_use=1&seating=0&from=widget_vue&t=1773805994&sign=6057e6a84b5a3091cd3e5ecc56d7429c
```

Probable purpose:
- bootstrap restaurant + booking context for widget page
- hydrate default info / last query / restaurant config

---

### 2) Availability / section timeslots
Endpoint:
```text
GET https://openapi.chope.co/availability/get_section_timeslots
```
Observed query params:
- `rid`
- `lang`
- `country_code`
- `adults`
- `source`
- `children`
- `rez_time` (date only in `YYYY-MM-DD` format)
- `mobile`
- `cc_code`
- `request_origin=widget2`
- `from=widget_vue`
- `smart`
- `t`
- `sign`

Observed example:
```text
https://openapi.chope.co/availability/get_section_timeslots?rid=originalgreens2505sg&lang=en_US&country_code=SG&adults=2&source=chope.com.sg&children=0&rez_time=2026-03-18&mobile=&cc_code=&request_origin=widget2&from=widget_vue&smart=1&t=1773805995&sign=bb26f74793e0c25598f7efa9e7592109
```

Probable purpose:
- fetch available timeslots and section-level seating availability for a selected date and party size

This is the strongest candidate for a future skill feature like:
- `check availability for 2 on 2026-03-18`

---

### 3) Deposit requirement check
Endpoint:
```text
GET https://api.chope.co/deposit/check_need_to_pay
```
Observed query params:
- `restaurantUid`
- `rez_id`
- `adults`
- `children`
- `section_id`
- `rez_time` (unix timestamp in this call)
- `DateTime`
- `override`
- `request_origin=widget2`
- `from=widget_vue`
- `smart`
- `lang`
- `t`
- `sign`

Observed example:
```text
https://api.chope.co/deposit/check_need_to_pay?restaurantUid=originalgreens2505sg&rez_id=&adults=2&children=0&section_id=&rez_time=1773763200&DateTime=18+Mar+2026+12:30+pm&override=0&request_origin=widget2&from=widget_vue&smart=1&lang=en_US&t=1773805995&sign=081d4081a55c9a72cdee3d5dfaa91bde
```

Probable purpose:
- determine whether a reservation needs deposit payment
- return deposit amount / cancellation note / deposit notice

The widget JS clearly uses this to decide whether it switches into a “Pay deposit” flow.

---

### 4) Restaurant-specific labels / CTA copy
Endpoint:
```text
GET https://api.chope.co/merchants/get_book_now_labels
```
Observed query params:
- `country_code`
- `lang`
- `source`
- `restaurantUID`
- `confirmationCode`
- `from=widget_vue`
- `smart`
- `t`
- `sign`

Observed example:
```text
https://api.chope.co/merchants/get_book_now_labels?country_code=SG&lang=en_US&source=chope.com.sg&restaurantUID=originalgreens2505sg&confirmationCode=&from=widget_vue&smart=1&t=1773805995&sign=1b912994c52c4a297d7e132ec88084d9
```

Probable purpose:
- fetch button labels / merchant-specific UX copy

---

### 5) Merchant consent / reservation policy
Endpoint:
```text
GET https://api.chope.co/merchants/consent
```
Observed query params:
- `restaurantUid`
- `adults`
- `children`
- `sectionId`
- `confirmationCode`
- `reserveTime` (unix timestamp)
- `request_origin=widget2`
- `from=widget_vue`
- `smart`
- `lang`
- `t`
- `sign`

Observed example:
```text
https://api.chope.co/merchants/consent?restaurantUid=originalgreens2505sg&adults=2&children=0&sectionId=&confirmationCode=&reserveTime=1773808200&request_origin=widget2&from=widget_vue&smart=1&lang=en_US&t=1773805995&sign=c0a3beac1a5072016dd6303b9ff688ea
```

Probable purpose:
- load reservation policy / consent checklists / terms presented before booking

---

## Internal action names found in widget JS

These are not final URLs, but they tell us what server capabilities exist in the frontend app.

From widget bundles, the booking check page invokes Vuex actions / methods named:
- `getCheckConditions`
- `getSpecialNoteTags`
- `getCheckNeedPay`
- `action_getsection_timeslot`
- `checkOTP`
- `getMobileVerify`
- `confirmBooking`
- `getConfirmOptions`

Other inferred capability groups:
- `forgot_pass`
- `login`
- `signup`
- `confirmBooking({ data, isFastCheckout })`

This strongly suggests final booking creation is done via a JS client action rather than plain HTML form submit.

---

## Final booking payload shape (important)

The widget JS includes a serializer that constructs the final booking object before calling `confirmBooking(...)`.

Observed normalized payload keys include:
- `children`
- `adults`
- `lang`
- `country_code`
- `email`
- `mobile`
- `phone_ccode`
- `restaurantName`
- `restaurantUID`
- `from_source`
- `forename`
- `surname`
- `is_booked_by`
- `is_myself`
- `source`
- `DateTime`
- `promotion_code`
- `section_id`
- `seating`
- `optin_groupmarketing`
- `optin_chopemarketing`
- `optin_restaurantmarketing`
- `selected_answers` (JSON string of custom question / consent answers)
- `deposit_notes`
- `appVersionInfo`
- `check_preorder`
- `is_preorder`
- `choose_type`
- `wait_list`
- `cq_format`
- `partner_user_id`
- `offer_uuid`
- optional `special_request`
- optional `allergies`
- optional `occasions`
- optional `confirmationCode`

This is the best clue for building a future full-booking client.

---

## OTP flow discovered

The widget has two separate OTP-related stages:

### OTP pre-check
Observed internal fields:
- `restaurantUID`
- `source`
- `cc_code`
- `telephone`
- `lang`

Probable purpose:
- ask server whether OTP is required for this booking / phone combination

### OTP send / verify
Observed internal payload fields for mobile verify action:
- `action=VERIFY` or `action=DO_VERIFY`
- `children`
- `adults`
- `lang`
- `country_code`
- `email`
- `mobile`
- `restaurantUID`
- `source`
- `DateTime`
- for verification step: `otp`
- sometimes `from_source=Widget`

Probable purpose:
- send OTP to diner
- validate OTP
- then continue booking creation

Implication:
A direct booking skill will likely need a conversational pause/resume step for OTP.

---

## reCAPTCHA / anti-abuse signals

Observed in widget:
- loads Google reCAPTCHA script
- signup flow explicitly renders reCAPTCHA
- direct endpoint fetches from a non-widget client returned `401`
- some endpoints depend on ephemeral `sign`

Implication:
A fully “API-only” OpenClaw skill is unlikely to be reliable without either:
1. browser automation, or
2. reverse-engineering the signing algorithm and all required headers/cookies.

---

## What is feasible for an OpenClaw skill now

### Practical v1
Recommended first version:
- search restaurants on Chope pages
- extract restaurant UID / slug / address / hours
- open / deep-link into booking widget with chosen date/time/pax
- optionally inspect live availability via browser session
- optionally assist user through booking in-browser

This is realistic and low-risk.

### Practical v2
- browser-driven booking assistant (operator-supervised)
- fills contact details
- handles consent checkboxes
- pauses for OTP from user
- clicks through deposit flow if user approves

This is feasible, but should probably be implemented as browser automation rather than a pure HTTP skill.

### Risky / incomplete v3
- pure HTTP client against `api.chope.co` / `openapi.chope.co`
- would require:
  - signing algorithm recovery
  - exact endpoint list for booking creation
  - cookie/session handling
  - OTP orchestration
  - complex anti-abuse edge cases that should not be bypassed

Not recommended as first implementation.

---

## Recommended skill design

### Skill name ideas
- `chope-booking`
- `chope-reservations`
- `restaurant-booking-chope`

### Suggested commands
- `search_restaurants(location, cuisine?, query?)`
- `get_restaurant(restaurant_slug_or_uid)`
- `check_availability(restaurant_uid, date, adults, children=0)`
- `start_booking(restaurant_uid, date, time, adults, children=0)`
- `complete_booking_browser(...)`

### Architecture recommendation

#### Option A — best first step
Use:
- `browser` tool for discovery + widget automation
- `web_fetch` / scraping for restaurant list pages

Why:
- avoids fragile signing reimplementation
- handles JS-only availability and OTP flows better
- easier to ship quickly

#### Option B — hybrid
Use:
- scraping for restaurant catalog
- browser for availability and final booking
- later, selectively replace widget steps with direct API calls where stable

This is probably the sweet spot.

---

## Suggested next reverse-engineering steps

1. Capture exact JSON bodies returned by:
   - `loadpage_vars`
   - `get_section_timeslots`
   - `check_need_to_pay`
   - `consent`
2. Find the actual network request behind `confirmBooking(...)`.
3. Find the actual network requests behind:
   - `checkOTP(...)`
   - `getMobileVerify(...)`
4. Determine how `sign` is generated:
   - in-browser JS?
   - server-supplied bootstrap?
   - static secret unlikely, but worth checking.
5. Test whether a browser-context fetch can be wrapped into an OpenClaw skill safely.

---

## Best conclusion right now

Chope definitely has browser-facing JSON APIs behind its booking widget.
But the safest and fastest OpenClaw skill path is **not** to build an unsupported raw API client first.

Best path:
1. build a restaurant discovery + availability assistant,
2. drive the official booking widget in-browser,
3. only later replace stable pieces with direct API calls if worth the effort.

---

## Evidence snippets

### Public restaurant page form
- `form action="https://book.chope.co/booking/check" method="get"`
- hidden `rid=originalgreens2505sg`
- hidden `source=chope.com.sg`
- hidden `redirect=1`

### Widget network resources observed
- `https://api.chope.co/widget_use/loadpage_vars?...`
- `https://openapi.chope.co/availability/get_section_timeslots?...`
- `https://api.chope.co/deposit/check_need_to_pay?...`
- `https://api.chope.co/merchants/get_book_now_labels?...`
- `https://api.chope.co/merchants/consent?...`

### Widget JS evidence
- final booking payload builder contains `restaurantUID`, `DateTime`, `selected_answers`, `special_request`, `allergies`, `occasions`, etc.
- booking flow functions invoke `confirmBooking`, `checkOTP`, `getMobileVerify`
- signup flow renders Google reCAPTCHA
