<img width="1463" height="853" alt="image" src="https://github.com/user-attachments/assets/3cf37bd3-cd6d-442a-8c3c-2dec1ddf8da9" />


<img width="1460" height="858" alt="image" src="https://github.com/user-attachments/assets/b885ab5e-3942-4b4b-8a61-50a896c31b43" />

## Deploy (Cloudflare Pages)

Cloudflare deploy now runs from GitHub Actions after `testing` succeeds on `main`.
If the Cloudflare Pages GitHub App is still connected, disable it or you may get duplicate deploys.

### Required GitHub Secrets

- `CLOUDFLARE_API_TOKEN`: Cloudflare API token with Pages deploy access
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account ID
- `VITE_SUPABASE_URL`: Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Supabase anon public key

### Required GitHub Variable

- `CLOUDFLARE_PAGES_PROJECT_NAME`: Cloudflare Pages project name

Build output is `dist`, and the deploy workflow is in [`.github/workflows/deploy-cloudflare.yml`](/Users/Nitzan/calorie-tracker/.github/workflows/deploy-cloudflare.yml:1).
If you set `CLOUDFLARE_PAGES_PROJECT_NAME` to `min-cal-tracker`, the Pages URL will be `https://min-cal-tracker.pages.dev` if that subdomain is available.
