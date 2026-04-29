<script setup lang="ts">
import AppHeader from "../components/header/AppHeader.vue";
import CloudSyncPanel from "../components/panels/CloudSyncPanel.vue";
import type { AppLocale, Profile } from "../types";

defineProps<{
  locale: AppLocale;
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
        :is-saving-locale="isSavingLocale"
        :cloud-confirmed-username="cloudConfirmedUsername"
        :is-cloud-busy="isCloudBusy"
        :show-logout="false"
        :auth-view="true"
        @locale-change="emit('locale-change', $event)"
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
  padding: clamp(1rem, 4vw, 2rem);
}

.login-card {
  inline-size: min(100%, 62rem);
  display: grid;
  gap: 1rem;
}
</style>
