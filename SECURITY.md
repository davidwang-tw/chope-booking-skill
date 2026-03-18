# Security Notes

## Data handling
- Do not persist OTP values.
- Do not persist card/payment details.
- Store only minimal workflow state needed for resume.

## Payment policy
- Require explicit user approval before continuing deposit/payment steps.

## Browser safety
- If captcha/anti-bot appears, pause and require manual intervention.
- Do not attempt bypass behavior.

## Secrets
- This skill currently does not require API keys.
- If future integrations add secrets, store via OpenClaw secrets tooling, not plaintext files.
