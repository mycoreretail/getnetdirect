GetNetDirect Shared Backend Fix

This folder contains the Railway API backend needed so customer QR submissions are stored centrally instead of only in the customer's browser.

Upload the entire "api" folder to the ROOT of the GitHub repository mycoreretail/getnetdirect.
Do not put the files inside another nested folder.

After upload, tell ChatGPT "api folder uploaded". ChatGPT can then finish configuring the Railway API service and generate its public URL.

Important: This backend creates its own PostgreSQL schema automatically and seeds the initial admin account from Railway environment variables. Do not place real passwords in GitHub files.
