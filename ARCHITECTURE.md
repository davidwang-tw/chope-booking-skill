# Architecture

## Components
- `SKILL.md`: OpenClaw skill contract and command interface.
- `scripts/openclaw_browser.js`: wrapper around `openclaw browser` CLI.
- `scripts/chope_search.js`: listing/search launcher + snapshot capture.
- `scripts/chope_availability.js`: widget URL generation + state detection.
- `scripts/chope_book.js`: booking orchestrator + checkpoint persistence.
- `scripts/chope_resume.js`: resume workflow for OTP/deposit checkpoints.

## State model
- Browser snapshot text is used to detect coarse workflow states.
- Session checkpoint files store minimal request context and last known status.

## Detection logic (current)
Pattern-based detection for:
- OTP challenge
- deposit/payment screen
- confirmation success
- no-availability
- captcha/manual intervention

## Rationale
A robust v1 should avoid dependence on unstable private API signatures and rely on the official UI flow with supervised operation.
