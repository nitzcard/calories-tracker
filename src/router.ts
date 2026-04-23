import { h } from "vue";
import { createRouter, createWebHistory } from "vue-router";

const EmptyRouteView = { render: () => h("div") };

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "dashboard",
      component: EmptyRouteView,
    },
    {
      path: "/login",
      name: "login",
      component: EmptyRouteView,
    },
  ],
});
