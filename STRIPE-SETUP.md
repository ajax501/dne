# Connect DNE to Stripe

The store now uses Stripe-hosted Checkout. Shipping is $10 USD per order, all six displayed sizes are available, and the address selector allows the shipping destinations enumerated by the installed Stripe SDK. Stripe/account restrictions may still limit payment or destination availability. There is no finite inventory tracking or reservation system.

## 1. Test setup in Vercel

Open the DNE project → Settings → Environment Variables. Add these server-side settings to the environment you are testing:

| Name | Value |
| --- | --- |
| `SITE_URL` | `https://dne-rho.vercel.app` (or the exact preview origin you test) |
| `STRIPE_SECRET_KEY` | Your Stripe sandbox/test secret API key, beginning `sk_test_` |
| `STRIPE_WEBHOOK_SECRET` | Signing secret from step 2, beginning `whsec_` |
| `CHECKOUT_ENABLED` | `true` |
| `STRIPE_AUTOMATIC_TAX` | `true` |
| `LIVE_CHECKOUT_APPROVED` | `false` |

Do not send secret keys in chat or add them to GitHub. This hosted integration does not need a browser publishable key. Use matching test/live credentials and webhook secrets. Redeploy after changing environment variables.

Automatic Tax is enabled by default. Configure Stripe Tax's business origin and applicable registrations in the corresponding Stripe environment. Setting `STRIPE_AUTOMATIC_TAX=false` disables tax collection; only do that if it reflects your intended tax setup. Shipping and product prices are exclusive of any calculated tax.

## 2. Stripe event destination

In Stripe Workbench → Webhooks, add an event destination for:

`https://dne-rho.vercel.app/api/stripe-webhook`

Subscribe to `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Copy that destination's signing secret into `STRIPE_WEBHOOK_SECRET`. Keep the endpoint accessible to Stripe; deployment password protection must not block it.

## 3. Test before taking money

- Add a product, select a size, and go to Checkout → Pay with Stripe.
- In test mode, use Stripe's test card `4242 4242 4242 4242`, a future expiry, and any valid test CVC. Never use real card information in test mode.
- Confirm correct model, size, quantity, $10 shipping, and tax before paying.
- Confirm the return page says **Test payment successful** and the paid items are removed from the bag.
- Cancel payment and confirm the bag remains intact.
- In Stripe, verify the event destination shows a successful delivery and the payment metadata includes `dne_payment_verified=true`.
- Confirm the address, email, purchased items, sizes, quantities, and order reference can be found on the Checkout session/payment in Stripe.
- Enable customer payment receipts and your own successful-payment notifications in Stripe's email settings; verify them. The application itself does not send emails.

## 4. Live setup

After a test passes, complete Stripe account activation. Replace the test secret with the live secret, create the same webhook destination in live mode, replace its signing secret, set `LIVE_CHECKOUT_APPROVED=true`, and redeploy. Keep `CHECKOUT_ENABLED=true`. You can stop new checkout sessions by setting it to `false` and redeploying; order-status and webhook endpoints remain available for existing payments.

## Fulfillment and refunds

Stripe is the order ledger for this version. Fulfillment is manual: review paid transactions in Stripe, open the related Checkout session for line items and delivery details, and prepare and ship the order. The webhook verifies Stripe's signature and records a payment-verified marker. It does not purchase shipping labels, send tracking emails, reserve stock, or mark packages shipped. Do not ship unpaid sessions. Track fulfillment against the unique Stripe payment/session ID so webhook retries never cause duplicate shipments. Refunds are handled in Stripe.

## Development

Run `npm ci`, copy `.env.example` to `.env.local`, set test values and `SITE_URL=http://localhost:3000`, then run `npm start`. The local server is now `dev-server.js` to keep it distinct from Vercel's `/api` functions. Use Stripe CLI forwarding for local webhook testing and its matching local signing secret. Run `npm test` and `npm run build` before deploying.

Automated tests use mocked Stripe API responses and real SDK webhook signatures. A real Stripe test payment still requires your account configuration.
