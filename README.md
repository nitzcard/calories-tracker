<img width="1463" height="853" alt="image" src="https://github.com/user-attachments/assets/3cf37bd3-cd6d-442a-8c3c-2dec1ddf8da9" />


<img width="1460" height="858" alt="image" src="https://github.com/user-attachments/assets/b885ab5e-3942-4b4b-8a61-50a896c31b43" />

## Deploy (Cloudflare Pages)

This repo is connected to Cloudflare Pages as a GitHub app integration, so Cloudflare builds and deploys automatically from `main`.

### Required GitHub Secrets

- `VITE_SUPABASE_URL`: Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Supabase anon public key

Set the build command to `npm run build` and the output directory to `dist` in the Cloudflare Pages project settings.
