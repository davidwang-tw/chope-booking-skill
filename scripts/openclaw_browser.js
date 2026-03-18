#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

function run(args) {
  const p = spawnSync('openclaw', ['browser', ...args], { encoding: 'utf8' });
  if (p.status !== 0) {
    const msg = (p.stderr || p.stdout || '').trim();
    throw new Error(msg || `openclaw browser failed: ${args.join(' ')}`);
  }
  return (p.stdout || '').trim();
}

function jsonOut(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

function toChopeDate(isoDate) {
  // YYYY-MM-DD -> DD Mon YYYY
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid date: ${isoDate}`);
  const day = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleString('en-US', { month: 'short' });
  const year = d.getFullYear();
  return `${day} ${mon} ${year}`;
}

function toChopeTime(hhmm) {
  const [hRaw, mRaw] = String(hhmm).split(':');
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isInteger(h) || !Number.isInteger(m)) throw new Error(`invalid time: ${hhmm}`);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function buildWidgetUrl({ rid, name, date, time, adults, children = 0, source = 'chope.com.sg' }) {
  const qs = new URLSearchParams({
    date: toChopeDate(date),
    name,
    time: toChopeTime(time),
    adults: String(adults),
    children: String(children),
    rid,
    source,
    redirect: '1',
    lang: 'en_US',
    country_code: 'SG'
  });
  return `https://book.chope.co/booking/check?${qs.toString()}`;
}

function detectState(snapshotText) {
  const t = snapshotText.toLowerCase();

  if (t.includes('verification code') || t.includes('one-time password') || t.includes('otp')) {
    return { status: 'needs_user_input', next_action: { type: 'otp', prompt: 'Enter the OTP sent to your phone.' } };
  }

  if (t.includes('deposit') || t.includes('pay now') || t.includes('payment')) {
    return {
      status: 'needs_user_input',
      next_action: {
        type: 'payment_approval',
        prompt: 'Deposit/payment step detected. Confirm if you want to continue.'
      }
    };
  }

  if (t.includes('booking confirmed') || t.includes('reservation confirmed') || t.includes('confirmation')) {
    return { status: 'success', next_action: null };
  }

  if (t.includes('no availability') || t.includes('not available') || t.includes('fully booked')) {
    return { status: 'unavailable', next_action: null };
  }

  if (t.includes('captcha') || t.includes('recaptcha')) {
    return {
      status: 'needs_user_input',
      next_action: {
        type: 'manual_browser_intervention',
        prompt: 'Captcha detected. Please solve in attached browser, then resume.'
      }
    };
  }

  return { status: 'in_progress', next_action: null };
}

module.exports = { run, jsonOut, buildWidgetUrl, detectState };
