GETNETDIRECT WEBSITE PROTOTYPE

Open index.html to view the public website.

Included pages:
- index.html              Public website + customer lead form
- partner.html            Referral partner program + application
- partner-dashboard.html  Demo partner dashboard + referral form
- admin.html              Demo admin dashboard
- privacy.html            Draft placeholder privacy notice
- terms.html              Draft placeholder terms

Prototype behavior:
- Customer leads and partner referrals are stored in browser localStorage only.
- ?ref=PARTNERCODE is captured as a referral source.
- Admin demo reads locally submitted leads from the same browser.
- No real login, database, SMS, email, carrier API, payment or payout functionality is connected yet.

Recommended production backend:
- Next.js or similar frontend framework
- Supabase/Postgres for database + authentication
- Row-level security / roles for admin, reps and partners
- Provider/address availability API(s)
- Email and SMS notifications
- Secure audit logs
- TCPA / marketing consent language reviewed by legal counsel
- Privacy policy and partner agreement reviewed before launch

Brand file included in assets/getnetdirect-logo.png.
