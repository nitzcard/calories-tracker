<img width="1463" height="853" alt="image" src="https://github.com/user-attachments/assets/3cf37bd3-cd6d-442a-8c3c-2dec1ddf8da9" />


<img width="1460" height="858" alt="image" src="https://github.com/user-attachments/assets/b885ab5e-3942-4b4b-8a61-50a896c31b43" />

## Deploy (Surge)

This repo includes a GitHub Actions workflow that deploys on every push to `main`.

### Required GitHub Secrets

- `SURGE_DOMAIN`: the full Surge domain to deploy to (example: `calories-tracker.surge.sh`)
- `SURGE_TOKEN`: Surge token (generate locally via `surge token`)
- `VITE_SUPABASE_URL`: Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Supabase anon public key

Add these at: GitHub repo → Settings → Secrets and variables → Actions → “New repository secret”.
