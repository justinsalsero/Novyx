# Activate Google Calendar in Novyx

The read-only Calendar integration is implemented in Novyx 4.0.2. It stays visibly unconnected until you register a Google OAuth client, store the app credentials securely, and grant access from inside Novyx. A Google Calendar connection in ChatGPT does not automatically authorize the separate Novyx app.

## Register the app

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a dedicated project for Novyx. Avoid sharing this OAuth project with unrelated apps: Google revocation affects the project’s grants.
2. In APIs & Services, enable **Google Calendar API**.
3. Open **Google Auth platform → Branding** and configure the name **Novyx**, your support email and your developer contact email. Use real app-owned policy and contact information for a production release.
4. In **Audience**, choose the appropriate audience. For a personal Gmail pilot, choose **External**, keep the app in **Testing**, and add the Google account you intend to connect under **Test users**.
5. In **Data Access**, add `openid`, `email`, and this scope:

   ```text
   https://www.googleapis.com/auth/calendar.events.readonly
   ```

6. In **Clients**, create an OAuth client with application type **Web application**. This is not an Android, iOS, desktop or service-account credential.
7. Register this exact **Authorized redirect URI**, including its query string:

   ```text
   https://novyx-3-0-9o43mh.v2.appdeploy.ai/?nyx_google=1
   ```

   If the console requests an authorized JavaScript origin, use:

   ```text
   https://novyx-3-0-9o43mh.v2.appdeploy.ai
   ```

8. Copy the resulting **Client ID** and **Client secret** into the secure AppDeploy configuration form under `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Do not paste values into chat, issues, source files, environment examples or GitHub. The secure form must be created and its submitted entries bound to this existing Novyx app.

Google can require brand, sensitive-scope and domain verification for public distribution. A hosted subdomain does not give you ownership of `appdeploy.ai`. If production verification requires a domain you control, establish that domain and update the registered redirect and the server’s fixed callback URI together. Do not claim the app is publicly verified while it remains in Testing.

## Connect and test

1. Sign in to Novyx with your usual Novyx account.
2. Open **Banking & Email → Google Calendar**.
3. Choose **Connect Google Calendar**, then **Continue to Google**. The Google page opens in a new tab so authorization is not embedded inside another page.
4. Choose your Google test account and approve the requested read-only Calendar access.
5. Google returns to Novyx. Novyx immediately removes the one-time code and state from its visible URL, then exchanges them on the authenticated backend. Use the same Novyx account that started the connection.
6. Choose **Sync appointments**. Novyx imports the previous 7 days and next 60 days from that account’s **primary calendar**. Sync runs in bounded pages. A paused or failed sync can be resumed.
7. Confirm an actual timed appointment, an all-day appointment and an overnight appointment appear with the correct Vancouver dates/times. Test an event marked Free: it must not block a focus session.
8. Change or cancel an appointment in Google, then sync again. Confirm the old copy no longer blocks planning.
9. Disconnect and confirm that access stops, saved tokens are removed, and imported snapshots become inactive. Manual Novyx events must remain.

Connecting does not automatically run a sync. Google events are read-only. Approving a Nyx focus session saves it in Novyx only; this build does not write back to Google.

## Expected limits and failure messages

- **App owner setup required:** the two Google OAuth app credentials are not bound to the deployment.
- **redirect_uri_mismatch:** the registered URI must match the exact value above; a plain trailing slash without the query string is a different URI.
- **Access denied / testing restriction:** check Audience → Test users and approve the Calendar permission. Organization policies can also block access.
- **Calendar API not enabled / permission denied:** enable the API in the same project as the OAuth client and check the granted scope.
- **Authorization expired or revoked:** disconnect, finish cleanup, and connect again. Google testing-mode refresh tokens normally expire after seven days when Calendar scope is requested.
- **Could not confirm provider revocation:** Novyx has stopped local access, but remove the project’s grant manually in your Google Account’s third-party connections if you need provider-side revocation confirmed.
- **Credentials rotated:** token encryption is derived from the confidential OAuth client secret using HKDF-SHA256 and AES-256-GCM with account-specific authenticated data. Changing that secret requires existing users to disconnect and reconnect; old encrypted tokens cannot be recovered with the new secret. Disconnect users before an intentional rotation where possible.

Calendar snapshots are private Novyx records and are included in normal backups. OAuth credentials, access/refresh tokens and pending authorization state are never included in backups or generic record APIs. Restoring calendar snapshots does not restore a Google connection.

## Implementation and acceptance status

Automated tests use a test-only SDK and provider response double. They cover missing configuration, authenticated ownership, state expiry/replay, PKCE, token encryption, rejected scope grants, token refresh/revocation, multi-page sync, cancellations, transparent and multi-day events, and disconnecting during a sync. These tests do not replace a real Google-account pilot or Google’s public-app verification.

## Primary references

- [OAuth web-server flow and token lifecycle](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Configure consent and test users](https://developers.google.com/workspace/guides/configure-oauth-consent)
- [Calendar events list and pagination](https://developers.google.com/workspace/calendar/api/v3/reference/events/list)
- [OAuth credential and token best practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices)
- [Refresh token expiration, including Testing mode](https://developers.google.com/identity/protocols/oauth2)
