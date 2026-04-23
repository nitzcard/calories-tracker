export function applyTheme() {
  document.documentElement.dataset.theme = "jasmine";
  document.documentElement.style.colorScheme = "dark";
  document.body.dataset.theme = "jasmine";
  delete document.documentElement.dataset.design;
  delete document.body.dataset.design;
}
