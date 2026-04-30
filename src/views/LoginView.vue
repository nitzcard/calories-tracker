<script setup lang="ts">
import AppHeader from "../components/header/AppHeader.vue";
import CloudSyncPanel from "../components/panels/CloudSyncPanel.vue";
import type { AppLocale, Profile, ThemePreference } from "../types";

defineProps<{
  locale: AppLocale;
  themePreference: ThemePreference;
  isSavingLocale: boolean;
  cloudConfirmedUsername: string;
  isCloudBusy: boolean;
  profile: Profile;
  cloudUsername: string;
  hasSavedCloudPassword: boolean;
  cloudStatus: "idle" | "synced" | "failed";
  cloudLastSyncedAt: string;
  cloudError: string;
  supabaseConfigured: boolean;
}>();

const emit = defineEmits<{
  "locale-change": [locale: AppLocale];
  "theme-change": [theme: ThemePreference];
  "update:profile": [profile: Profile];
  "save-profile": [profile: Profile];
  "update:cloud-username": [value: string];
  sync: [payload: { username: string; password?: string }];
  logout: [];
}>();
</script>

<template>
  <main class="login-shell">
    <section class="login-card">
      <AppHeader
        :locale="locale"
        :theme-preference="themePreference"
        :is-saving-locale="isSavingLocale"
        :cloud-confirmed-username="cloudConfirmedUsername"
        :is-cloud-busy="isCloudBusy"
        :show-logout="false"
        :auth-view="true"
        @locale-change="emit('locale-change', $event)"
        @theme-change="emit('theme-change', $event)"
      />

      <CloudSyncPanel
        :locale="locale"
        :profile="profile"
        :cloud-username="cloudUsername"
        :cloud-confirmed-username="cloudConfirmedUsername"
        :has-saved-cloud-password="hasSavedCloudPassword"
        :is-cloud-busy="isCloudBusy"
        :cloud-status="cloudStatus"
        :cloud-last-synced-at="cloudLastSyncedAt"
        :cloud-error="cloudError"
        :supabase-configured="supabaseConfigured"
        :auth-view="true"
        @update:profile="emit('update:profile', $event)"
        @save="emit('save-profile', $event)"
        @update:cloud-username="emit('update:cloud-username', $event)"
        @sync="emit('sync', $event)"
        @logout="emit('logout')"
      />
    </section>
  </main>
</template>

<style scoped>
.login-shell {
  min-block-size: 100vh;
  display: grid;
  place-items: center;
  padding: clamp(1rem, 4vw, 3rem);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--surface-2) 74%, transparent) 0 38%, transparent 38% 100%),
    linear-gradient(180deg, color-mix(in srgb, var(--bg) 86%, var(--surface-1)), var(--bg));
}

.login-card {
  inline-size: min(100%, 72rem);
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(20rem, 27rem);
  align-items: center;
  gap: clamp(1.25rem, 5vw, 4rem);
}

.login-card :deep(.header-shell--auth) {
  inline-size: 100%;
  max-inline-size: none;
  grid-template-columns: 1fr;
  justify-items: start;
  align-content: center;
  text-align: start;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
}

.login-card :deep(.header-shell--auth .title-row) {
  justify-content: flex-start;
  align-items: flex-start;
  gap: 0.95rem;
}

.login-card :deep(.header-shell--auth .brand-mark) {
  inline-size: 3.35rem;
  block-size: 3.35rem;
  border-radius: var(--radius);
}

.login-card :deep(.header-shell--auth .brand-mark__svg) {
  inline-size: 1.55rem;
  block-size: 1.55rem;
}

.login-card :deep(.header-shell--auth .title) {
  font-size: clamp(1.85rem, 4vw, 3.35rem);
  line-height: 0.98;
  letter-spacing: 0;
}

.login-card :deep(.header-shell--auth .helper-text) {
  max-inline-size: 30rem;
  font-size: clamp(1rem, 1.55vw, 1.18rem);
  line-height: 1.55;
  margin-block-start: 0.35rem;
}

.login-card :deep(.header-shell--auth .toolbar) {
  inline-size: 100%;
  justify-content: flex-start;
  margin-block-start: 1.3rem;
}

.login-card :deep(.header-shell--auth .meta-row) {
  justify-content: flex-start;
}

@media (max-width: 820px) {
  .login-shell {
    place-items: start center;
  }

  .login-card {
    grid-template-columns: 1fr;
    gap: 1.25rem;
    inline-size: min(100%, 31rem);
  }

  .login-card :deep(.header-shell--auth) {
    justify-items: center;
    text-align: center;
  }

  .login-card :deep(.header-shell--auth .title-row) {
    justify-content: center;
    align-items: center;
  }

  .login-card :deep(.header-shell--auth .toolbar),
  .login-card :deep(.header-shell--auth .meta-row) {
    justify-content: center;
  }
}

@media (max-width: 460px) {
  .login-shell {
    padding: 0.85rem;
  }

  .login-card :deep(.header-shell--auth .title-row) {
    display: grid;
    justify-items: center;
  }
}
</style>
