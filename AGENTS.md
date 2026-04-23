@/Users/Nitzan/caveman/skills/caveman/SKILL.md

Dev server rules:
- Do not kill existing Vite dev server unless user explicitly asks.
- Before starting app, run `npm run app:url`.
- If command prints URL, reuse that running app instead of starting/restarting anything.
- If no URL found, start app with `npm run dev`.
- If multiple app instances exist, prefer lowest active localhost port returned by `npm run app:url`.
