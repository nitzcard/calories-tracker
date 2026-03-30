import "./styles/app.css";
import "uplot/dist/uPlot.min.css";
import { createApp } from "vue";
import App from "./App.vue";
import { i18n } from "./i18n";

createApp(App).use(i18n).mount("#app");
