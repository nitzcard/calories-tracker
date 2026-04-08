<img width="1463" height="853" alt="image" src="https://github.com/user-attachments/assets/3cf37bd3-cd6d-442a-8c3c-2dec1ddf8da9" />


<img width="1460" height="858" alt="image" src="https://github.com/user-attachments/assets/b885ab5e-3942-4b4b-8a61-50a896c31b43" />

## Deploy (Static.app)

This repo includes a GitHub Actions workflow that deploys on every push to `main`.

### Required GitHub Secrets

- `STATIC_APP_API_KEY`: your Static.app API key
- (Optional) `STATIC_APP_PID`: set this after your first deploy to keep updating the same site
- (Optional, for Cloud Sync) `VITE_SUPABASE_URL`: Supabase project URL
- (Optional, for Cloud Sync) `VITE_SUPABASE_ANON_KEY`: Supabase anon public key

Add these at: GitHub repo → Settings → Secrets and variables → Actions → “New repository secret”.
