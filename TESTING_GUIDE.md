# INQUEST — Testing Guide

Backend: http://localhost:5001 | Frontend: http://localhost:5173 (ya jo bhi port dikhe)
Admin password (for verification feature): <ADMIN_PASSWORD from your .env>

## Pre-existing Demo Customers

| ID | Name | Tier | Has order/payment history |
|---|---|---|---|
| CUST001 | Ravi Sharma | gold | ORDER456 — duplicate payment issue baked in |
| CUST002 | Priya Mehta | silver | ORDER789 — in_transit (no payment record) |
| CUST003 | Aman Verma | platinum | ORDER101 — return requested, payment verified |
| CUST004 | Sneha Kapoor | silver | ORDER202 — delivered, prior late-delivery ticket |

---

## Test 1 — AUTO_RESOLVE (duplicate payment, clean evidence)

Customer: **CUST001 (Ravi Sharma)**
Complaint (English): 
> I was charged twice for order #456! Please fix this immediately.

Complaint (Hinglish):
> bhai payment 2 baar kat gyi order #456 ke liye, please jaldi fix karo

Expected: `AUTO_RESOLVE`, ~95-98% confidence, POLICY7 matched, refund of ₹1499 shown in handoff.

---

## Test 2 — CUSTOMER_CONFIRM (return/refund, no hard mismatch)

Customer: **CUST003 (Aman Verma)**
Complaint:
> I requested a return for my order #101 but haven't received any update on my refund status.

Expected: likely `AUTO_RESOLVE` or `CUSTOMER_CONFIRM` depending on AI read — POLICY3 usually matches since returnRequested=true.

---

## Test 3 — CUSTOMER_CONFIRM (product damage — never auto-resolves by design)

Customer: **CUST004 (Sneha Kapoor)**
Complaint:
> My order #202 arrived with a small tear, I want a replacement.

Expected: `CUSTOMER_CONFIRM` (product_quality intent is hardcoded to never AUTO_RESOLVE, since only the customer's word is "evidence").

---

## Test 4 — HUMAN_ESCALATION (delivery delay, no strong policy match)

Customer: **CUST002 (Priya Mehta)**
Complaint (English):
> My order #789 is taking longer than expected, not sure what's going on.

Complaint (Hinglish):
> mera order abhi tak nahi aaya, bahut delay ho gaya hai

Expected: `CUSTOMER_CONFIRM` or `HUMAN_ESCALATION` — POLICY11 (Delayed Delivery Compensation) may or may not match depending on AI confidence, since order789 has no delivery date logged.

---

## Test 5 — HUMAN_ESCALATION (high-risk keyword — always escalates)

Customer: **CUST002 (Priya Mehta)**
Complaint:
> I noticed some suspicious activity on my account, someone may have accessed it without permission.

Expected: `HUMAN_ESCALATION` always — regardless of confidence, security keywords force escalation.

---

## Test 6 — Wrong item received (new policy, test AI reasoning)

Customer: **CUST001 (Ravi Sharma)**
Complaint:
> I ordered wireless earbuds for order #456 but received a completely different product.

Expected: variable — tests whether POLICY12 (Wrong Item Received) gets matched by the AI from text alone.

---

## Test 7 — Dynamic "Add Customer" flow (full demo of scalability)

1. In the UI, click "Add Customer"
2. Fill: Name = "Karan Malhotra", Email = "karan@example.com", Tier = "gold"
3. Also fill order details: Product = "Gaming Mouse", Amount = 2499, Status = "delivered",
   Gateway Status = "success", Local Status = "failed" (this seeds a duplicate-payment-style case)
4. Submit — new customer should appear selected immediately
5. Complaint: "I was charged twice for my gaming mouse order"
6. Expected: `AUTO_RESOLVE` — proves the system works end-to-end on data created live in front of judges, not just pre-seeded customers.

---

## Test 8 — Manual Verification feature (for escalated/confirm cases)

1. Run any complaint that results in `HUMAN_ESCALATION` or `CUSTOMER_CONFIRM` (e.g. Test 5)
2. Click "Verify Manually" on the result
3. Enter: Employee Name, Employee Email, Admin Password = `<ADMIN_PASSWORD from your .env>`
4. Upload an ID card photo
5. Expected: system compares against the reference ID card (must be uploaded once beforehand via
   admin) and returns verified=true/false with a confidence score and reasoning.

Note: a reference ID card must already be configured on the backend (done once via the admin
upload flow) before this test will return meaningful results — otherwise it responds with
"No reference ID card has been configured yet."

---

## Important notes for the demo

- AI responses are not 100% deterministic — Gemini may phrase things slightly differently or
  occasionally land on a different confidence score each run. Test each scenario once beforehand
  so you know roughly what to expect live.
- If a result unexpectedly falls back to "Could not determine automatically" with 0% confidence
  and `source: "fallback"`, that's a transient Gemini rate-limit — wait ~10 seconds and retry.
- New customers added via "Add Customer" reset when the backend server restarts (in-memory demo
  data, not a real database) — re-add them if you restart the server before the demo.
