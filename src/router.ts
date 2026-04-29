import { h } from "vue";
import { createRouter, createWebHistory } from "vue-router";

const EmptyRouteView = { render: () => h("div") };

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "root",
      component: EmptyRouteView,
    },
    {
      path: "/login",
      name: "login",
      component: EmptyRouteView,
    },
    {
      path: "/today",
      name: "today",
      component: EmptyRouteView,
    },
    {
      path: "/progress",
      name: "progress",
      component: EmptyRouteView,
    },
    {
      path: "/settings",
      name: "settings",
      component: EmptyRouteView,
    },
  ],
});
