import { jsxRenderer } from 'hono/jsx-renderer'
import { Link } from 'honox/server'

export default jsxRenderer(({ children }) => (
  <html lang="en" data-theme="corporate">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="description" content="Local-first job application tracker" />
      <title>Job Application Tracker</title>
      <Link href="/app/style.css" rel="stylesheet" />
      <script src="https://cdn.jsdelivr.net/npm/htmx.org@2.0.8/dist/htmx.min.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/formbouncerjs@1.4.6/dist/bouncer.polyfills.min.js"></script>
    </head>
    <body>
      <div id="flash" class="toast toast-top toast-center z-50" aria-live="polite"></div>
      {children}
      <script
        dangerouslySetInnerHTML={{
          __html: `
  function initBouncer(root) {
    if (!window.Bouncer) return;
    if (window.jobBouncer) window.jobBouncer.destroy();
    window.jobBouncer = new Bouncer('form[novalidate]', { disableSubmit: true });
  }
  document.addEventListener('DOMContentLoaded', initBouncer);
  document.body.addEventListener('htmx:afterSwap', initBouncer);
  document.body.addEventListener('htmx:afterSwap', function (event) {
    const target = event.detail.target;
    const formRegion = target && target.matches && target.matches('[data-autofocus]') ? target : target && target.querySelector && target.querySelector('[data-autofocus]');
    if (!formRegion) return;
    formRegion.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const input = formRegion.querySelector('[data-primary-input]');
    if (input) input.focus();
  });
  document.body.addEventListener('click', function (event) {
    const target = event.target instanceof Element ? event.target : null;
    const openWorkspace = target && target.closest('[data-open-workspace]');
    if (openWorkspace) {
      const drawerToggle = document.getElementById('workspace-toggle');
      if (drawerToggle) drawerToggle.checked = true;
      return;
    }
    const tabButton = target && target.closest('[data-workspace-tab]');
    if (!tabButton) return;
    const tab = tabButton.dataset.workspaceTab;
    document.querySelectorAll('[data-workspace-panel]').forEach(function (panel) {
      panel.classList.toggle('hidden', panel.id !== 'workspace-' + tab + '-panel');
    });
    document.querySelectorAll('[data-workspace-tab]').forEach(function (button) {
      const active = button === tabButton;
      button.classList.toggle('tab-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  });
  document.body.addEventListener('htmx:responseError', function () {
    document.getElementById('flash').innerHTML = '<div class="alert alert-error">The request could not be completed.</div>';
  });
`,
        }}
      />
    </body>
  </html>
))
