<img width="1463" height="853" alt="image" src="https://github.com/user-attachments/assets/3cf37bd3-cd6d-442a-8c3c-2dec1ddf8da9" />


<img width="1460" height="858" alt="image" src="https://github.com/user-attachments/assets/b885ab5e-3942-4b4b-8a61-50a896c31b43" />

## Deploy (Cloudflare Pages)

This repo deploys through GitHub Actions to Cloudflare Pages. The workflow runs after the `testing` workflow succeeds on `main`.

### Required GitHub Secrets

- `CLOUDFLARE_ACCOUNT_ID`: your Cloudflare account ID
- `CLOUDFLARE_API_TOKEN`: Cloudflare API token with Pages deployment access
- `VITE_SUPABASE_URL`: Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Supabase anon public key

The workflow deploys to the Cloudflare Pages project named `calorie-tracker`. If you use a different project name, update `.github/workflows/deploy-cloudflare-pages.yml`.

Add these at: GitHub repo → Settings → Secrets and variables → Actions → “New repository secret”.
