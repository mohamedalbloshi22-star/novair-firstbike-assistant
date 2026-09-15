# BSR-1 Self-Service Product Specification V2

Status: Preview Build Definition
Environment: Preview only
Production: Not authorized

## Product model
BSR-1 is a self-service AI customer-response assistant sold by BASEERA. After subscription activation, the customer receives two separate experiences:

1. Assistant link: customer-branded AI chat used by the customer's own visitors/customers.
2. Customer control center: private dashboard used by the subscriber to configure, train, monitor, renew and upgrade the product.

BASEERA is not the customer's daily managed operator. Support is on request.

## Customer assistant
- AI chat grounded in customer-provided knowledge.
- Knowledge sources: manual Q&A plus PDF, Word and Excel files.
- Customer can configure business name, assistant name, logo, welcome message, primary color, one active language (Arabic or English), working hours, contact details and social links.
- Contact actions: request callback and request human assistance.
- Contact request captures customer name, phone or email, and a predefined reason with an Other option.
- Request is recorded in the customer dashboard and emailed to the subscriber.
- End-of-conversation feedback: Did we solve your request? Yes/No plus optional note.
- Delivery options: direct link, iframe embed and website widget.

## Customer dashboard
Shows subscription plan, AI allowance used and remaining, subscription start/end date, renewal/upgrade controls, knowledge management, assistant branding/settings, install options, contact requests, support and plan-appropriate analytics.

## Plans
### Essential
- 10,000 AI responses/month.
- 10 knowledge files.
- Analytics: unique assistant users, conversations, AI usage.
- Support: email.

### Pro
- 50,000 AI responses/month.
- 50 knowledge files.
- Essential analytics plus resolution yes/no rate, callback requests and human-help requests.
- Support: priority email / faster response.

### Enterprise
- 200,000 AI responses/month.
- 200 knowledge files.
- Pro analytics plus top questions, peak usage times, usage trend and returning-user rate.
- Support: priority plus dedicated support.
- Custom domain capability may be enabled later.

## Subscription behavior
- Initial sales and activation are manual.
- Architecture must support payment automation later without rebuild.
- 3-day grace period after expiry.
- After grace period, assistant stops while customer dashboard remains available for renewal.
- AI hard cap: assistant AI stops immediately when monthly AI allowance is exhausted.
- Usage alerts to dashboard and subscriber email when 20%, 10% and 5% of AI allowance remains.
- Upgrade/renewal is manual-first with later payment automation.

## Access
- Customer dashboard target access: owner plus one additional user.
- Target login UX: email + password.
- Conversation/customer-request retention target: 12 months.
- Tenant isolation is mandatory. Any cross-tenant access is a critical blocker.

## Commercial governance
Product & Technology does not set commercial prices. After product completion/testing, Finance performs pricing review using cost and market evidence; founder approval governs new/material prices. Sales receives a Product Sales Pack containing target need, value proposition, package features, differentiation, use cases, approved claims, objections, limitations and commercially approved price once Finance completes the pricing path.

## Release gate
Required before Ready for Founder Trial: authentication, authorization, tenant isolation, RLS, data integrity, core functions, error handling, rate limits, mobile/desktop, performance, security, Arabic/English behavior, auditability and cross-tenant negative tests.