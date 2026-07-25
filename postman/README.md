# HouseIQ Postman

Import both files into Postman:

1. `HouseIQ.postman_collection.json`
2. `HouseIQ.local.postman_environment.json`

Select the **HouseIQ Local** environment.

## Auth (automatic)

The collection pre-request script fetches Auth0 tokens using the Resource Owner Password credentials from `backend/.env` (`AUTH0_TEST_*`), mirrored into the Postman environment as:

- `auth0Domain`, `auth0Audience`, `auth0ClientId`, `auth0ClientSecret`, `auth0Realm`
- `auth0UserAUsername` / `auth0UserAPassword` → refreshes `accessToken`
- `auth0UserBUsername` / `auth0UserBPassword` → refreshes `accessTokenUserB`

Tokens are cached until near expiry. You should not need to paste Bearer tokens from the browser.

Re-copy credentials into the Postman environment after changing `backend/.env` (or re-run the local sync helper).

## IDs

| Variable | How it gets set |
|---|---|
| `homeId` | Auto from Homes list/create (User A) |
| `userBHomeId` | Auto from User B Setup list/create |
| `ownedDocumentId` | Auto from Documents list (or upload if still empty) |
| `deletableDocumentId` | Auto from Documents upload (disposable file) |
| `deletedDocumentId` | Auto after disposable delete |
| `userBDocumentId` | Auto from User B Setup list/upload |

No manual UUID paste is required when Auth0 User A/B credentials are set.

## Suggested runner order

1. **Homes** — sets `homeId`
2. **Home Profile** — GET/PATCH profile + cross-user 404 checks
3. **Documents** — sets `ownedDocumentId` / `deletableDocumentId` (select a file for upload)
4. **User B Setup** — sets `userBHomeId` / `userBDocumentId` (select a file for User B upload if needed)
5. **Document Ownership** — authz suite

## Connecting Postman MCP in Cursor (optional)

So this agent can push/update the collection in your Postman cloud workspace:

1. Install the Postman plugin in Cursor (`/add-plugin postman`) **or** add an MCP server pointing at `https://mcp.postman.com/mcp`.
2. Generate an API key at [Postman API Keys](https://go.postman.co/settings/me/api-keys).
3. Set `POSTMAN_API_KEY` in your environment.
4. Restart Cursor / reload MCP, then ask: “Sync the HouseIQ Postman collection to my workspace.”
