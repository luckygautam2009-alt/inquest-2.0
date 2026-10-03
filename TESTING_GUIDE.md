# Inquest 2.0 Testing Guide

## Setup
1. In inquest-backend: copy ../.env.example to .env, then fill GEMINI_API_KEY and a strong ADMIN_PASSWORD.
2. Backend: cd inquest-backend, npm install, npm run dev (port 5001).
3. Frontend: cd inquest-frontend, npm install, npm run dev (port 5173).

## One-click demo (backend must be running)

    cd inquest-backend
    npm run demo -- /path/to/damaged-item-photo.jpg

It creates a fresh customer, places real orders through the store API and runs:

| Case | Scenario | Expected |
|---|---|---|
| A | Duplicate payment | AUTO_RESOLVE (POLICY7) + refund |
| B | Damaged item + genuine photo | AUTO_RESOLVE (POLICY6) + refund |
| C | Same photo submitted again | HUMAN_ESCALATION (image reuse) |
| D | Security concern | HUMAN_ESCALATION (POLICY9) |
| E | Delivery delay | CUSTOMER_CONFIRM, then credit on acceptance |

Use "npm run reset-demo" to clear auto-created refunds, tickets and image hashes. The audit log is append-only and is never reset.

## Other scripts (inquest-backend/scripts)
- demo_risk_test.js: synthetic abuser, risk score 85, escalated despite a valid duplicate payment.
- demo_override_test.js: admin UNDO of an AI refund, double-override blocked.
- demo_confirm_test.js: delay compensation, customer accepts or declines.
- demo_shop_test.js: store orders feeding complaints.

## Browser walkthrough
1. Open /store, create a customer, buy a product with "Double charge glitch".
2. "Report a problem" opens Inquest with the complaint pre-filled. Submit it.
3. The result shows the decision, action taken, risk score, photo evidence and audit entry.
4. Admin (Analytics, Audit Log) shows hash-chain status and lets you undo an AI action.

## Decision rules worth knowing
- Risk score 60 or more: always HUMAN_ESCALATION.
- Photo auto-resolve only for damage (POLICY6), order value up to PHOTO_VALUE_CAP, vision confidence at least PHOTO_MIN_CONFIDENCE.
- Wrong item (POLICY8) and delivered-not-received (POLICY10) always go to a human.
- Delay compensation is a customer choice (credit or expedite), never automatic.
