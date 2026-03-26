# Architecture

## Components

- `SKILL.md`: OpenClaw skill contract and command interface.
- `scripts/shared.js`: shared utilities (CLI argument parser, handoff builder, constants).
- `scripts/openclaw_browser.js`: wrapper around `openclaw browser` CLI, input validation, date/time conversion, widget URL builder, DOM-first state detection, user-safe messaging.
- `scripts/chope_search.js`: listing/search launcher + snapshot capture.
- `scripts/chope_availability.js`: widget URL generation + state detection.
- `scripts/chope_book.js`: booking orchestrator + checkpoint persistence + contact profile integration.
- `scripts/chope_resume.js`: resume workflow for OTP/deposit checkpoints.
- `scripts/session_state.js`: session checkpoint save/load with TTL-based cleanup.
- `scripts/idempotency.js`: duplicate-booking prevention via SHA-256 fingerprinting.
- `scripts/observability.js`: redacted event logging and append-only metrics.
- `scripts/contact_profiles.js`: per-user contact profile store with file locking.
- `scripts/contact_profiles_cli.js`: CLI for contact profile management.

## State model

- Browser snapshot text and live DOM markers are used to detect workflow states.
- Session checkpoint files store minimal request context and last known status.
- Idempotency ledger tracks booking fingerprints to block duplicate intents.
- Contact profile store persists per-user booking contact details with configurable TTL.
- Append-only event logs and metric counters provide redacted observability.

## Detection logic

Two-layer state detection strategy:

1. **DOM-first** (`detectStateDomFirst`): evaluates live DOM markers via `browserEvaluate` for OTP inputs, payment markers, confirmation signals, unavailability, and captcha.
2. **Text fallback** (`detectState`): pattern-based detection on snapshot text when DOM markers are unavailable.

Cross-validation rules:
- `success` requires 2+ independent DOM signals (e.g., confirmation marker + booking reference).
- Text/DOM mismatches degrade to `unknown` rather than producing false positives.
- Captcha detection takes priority over all other states.

## Rationale

A robust v1 should avoid dependence on unstable private API signatures and rely on the official UI flow with operator-assisted operation. This skill interacts exclusively through the public browser-facing widget.
