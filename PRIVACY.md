# Privacy

This project may store limited local data to support operator-assisted booking workflows and optional contact reuse features.

Depending on configuration, this may include:

- saved contact profile information used for repeat bookings,
- limited workflow/session checkpoint data,
- operational metadata such as idempotency or handoff state,
- and redacted observability events.

This project is not intended to store OTP values or payment card data.

## What may be stored

- Contact profile fields needed for booking form reuse (for example name, email, mobile, and optional preferences).
- Workflow checkpoint metadata used by resume flows.
- Idempotency fingerprints derived from booking parameters and a one-way hash of contact details (original contact values are not stored in the idempotency ledger).
- Correlation identifiers for debugging and log tracing.

## What should not be stored

- OTP values.
- Payment card information.
- Full raw secrets unrelated to booking workflow operation.

## Retention

- Saved contact profile retention defaults to `180` days.
- Override via `CHOPE_CONTACT_PROFILE_TTL_DAYS`.
- Session checkpoint data uses local temp storage with periodic cleanup.

## User controls

Profiles can be managed per user with:

- list
- get default
- set default
- delete one
- delete all

Set `save_contact: false` on a booking request to avoid profile save/update for that request.

## Operator responsibilities

Operators are responsible for:

- securing local storage and runtime hosts,
- respecting applicable privacy obligations and data minimization requirements,
- configuring retention periods suitable for their environment,
- and honoring deletion requests where applicable.

Operators should ensure local state/contact files are not committed to version control or shared inappropriately.
