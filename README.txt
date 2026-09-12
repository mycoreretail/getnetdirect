GetNetDirect Website Prototype
==============================

Main pages
- index.html                Public customer website
- partner.html              Referral partner program / application
- partner-dashboard.html    Referral partner portal
- employee-dashboard.html   Employee / sales representative portal
- admin.html                GetNetDirect administrator portal
- privacy.html              Privacy placeholder
- terms.html                Terms placeholder

Admin portal prototype features
- View all direct and referral leads
- Search and filter leads
- Assign leads to employees
- Update provider, lead outcome, order number and install date
- Mark customers Signed Up / Installed / Not Signed Up
- Set partner payout amount and status (Pending / Approved / Paid)
- Record payout paid date and payment reference
- Partner payout ledger
- Create employee profiles and open their portal views
- Copy a referral-status message for a partner

Partner portal prototype features
- Submit customer referrals
- Unique referral code / link
- Referral status tracking
- See signed-up / installed outcomes
- See approved and paid payout amounts
- Payout ledger

Employee portal prototype features
- Employee-specific assigned lead list
- Call / text / email shortcuts
- Update lead status and provider
- Enter order number and install date
- Internal notes
- Performance snapshot
- No access to partner payout controls

IMPORTANT
This is still a front-end prototype using browser localStorage. Data is not shared between computers, phones, employees or partners yet. Before using this with real customers, connect a secure backend/database and authentication system (for example Supabase), and add proper role-based permissions. Do not collect SSNs, full card information or carrier passwords in these prototype forms.
