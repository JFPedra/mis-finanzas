# Gmail → Firebase Sync — Setup

The sync (`gmail_finanzas_sync.py`) runs on a **GitHub Actions scheduled workflow** three times a day: 12:40 pm, 6:40 pm and 10:40 pm Colombia time (`40 17,23,3 * * *` UTC). It imports bank transactions from Gmail into Firestore, using the **Google Gemini API** to parse unstructured email content into structured financial data.

There is no local machine or cron involved — once set up, it runs entirely on GitHub's infrastructure.

---

## How it works

1. The `Gmail Finance Sync` workflow (`.github/workflows/gmail_sync.yml`) triggers at 12:40 pm, 6:40 pm and 10:40 pm Colombia time
2. It polls Gmail for emails with the configured label — `gmailLabel` in `finance_settings/default`, editable in the app under Settings → Finanzas (default: `Bancos/PendingBot`)
3. Each email body is sent to Gemini (`gemini-3.1-flash-lite`), which returns a structured transaction
4. The transaction is saved to the `finance_transactions` Firestore collection
5. The Gmail label is removed and the message ID is recorded in `processed_gmail_ids`

State lives entirely in Firestore — the workflow itself is stateless:

| Firestore path | Purpose |
|----------------|---------|
| `gmail_auth/token` | The Gmail OAuth token, auto-refreshed on each run |
| `processed_gmail_ids/{id}` | One doc per processed email, for deduplication |

Both are blocked from client access by `firestore.rules`; only the backend Admin SDK can read them.

---

## Prerequisites

- A **Google Cloud project** with the Gmail API enabled and an OAuth 2.0 Client ID (Desktop App)
- The OAuth consent screen **published to "In production"** — see the warning below
- A **Gemini API key** — [Google AI Studio](https://aistudio.google.com/apikey)
- A **Firebase project** with Firestore enabled, and an Admin SDK service account key
- The [`gh` CLI](https://cli.github.com/) authenticated, and the [Firebase CLI](https://firebase.google.com/docs/cli)

> **⚠️ The OAuth consent screen must be "In production".** While it is in "Testing" status, Google expires refresh tokens after 7 days, which silently breaks the sync. Publish the app: Google Cloud Console → APIs & Services → OAuth consent screen → **Publish app**. An "unverified app" warning during the consent flow is expected and harmless for personal use.

---

## One-time setup

### 1. Configure GitHub secrets

From the repo root, with `credentials.json` and `firebase-adminsdk-*.json` present locally:

```bash
gh secret set GMAIL_CREDENTIALS_JSON < credentials.json
gh secret set FIREBASE_ADMIN_SDK_JSON < firebase-adminsdk-*.json
gh secret set GEMINI_API_KEY        # paste the key when prompted
```

| Secret | Used for |
|--------|----------|
| `GEMINI_API_KEY` | Gemini API authentication |
| `FIREBASE_ADMIN_SDK_JSON` | Firestore access via the Admin SDK |
| `GMAIL_CREDENTIALS_JSON` | OAuth client config — kept as a backup; not required at runtime |

### 2. Seed the Gmail token into Firestore

`bootstrap_token.py` writes the OAuth token to `gmail_auth/token`. Run it once locally; if no valid token exists it opens a browser to authenticate:

```bash
pip install -r requirements.txt
python3 bootstrap_token.py
```

It connects to Firestore via the local `firebase-adminsdk-*.json`. Re-run it any time the token is revoked or expired.

### 3. Deploy the Firestore security rules

```bash
firebase deploy --only firestore:rules
```

---

## Running it

- **Automatic:** the workflow runs three times a day once `gmail_sync.yml` is on the `main` branch.
- **Manual:** GitHub → Actions → *Gmail Finance Sync* → *Run workflow*, or:
  ```bash
  gh workflow run gmail_sync.yml
  ```

> GitHub may delay scheduled runs by several minutes under load, and disables scheduled workflows after 60 days of repo inactivity.

### Local test run

```bash
GEMINI_API_KEY=... FIREBASE_ADMIN_SDK_JSON="$(cat firebase-adminsdk-*.json)" python3 gmail_finanzas_sync.py
```

---

## Debugging

```bash
gh run list --workflow=gmail_sync.yml      # recent runs
gh run view <run-id> --log                 # full log of a run
gh run view <run-id> --log-failed          # only the failed steps
```

To reprocess an email: delete its doc from the `processed_gmail_ids` collection and re-apply the sync label in Gmail.

### Common failure: `invalid_grant`

The Gmail OAuth token was revoked or expired. Re-run `python3 bootstrap_token.py` — it re-authenticates via the browser — then re-run the workflow. If it recurs, confirm the OAuth consent screen is "In production" (see Prerequisites).
