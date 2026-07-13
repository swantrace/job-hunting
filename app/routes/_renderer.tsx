import { jsxRenderer } from 'hono/jsx-renderer'
import appCss from '../style.css?url'

export default jsxRenderer(({ children }) => (
  <html lang="en" data-theme="corporate">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="description" content="Local-first job application tracker" />
      <title>Job Application Tracker</title>
      <link rel="stylesheet" href={appCss} />
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
  document.body.addEventListener('htmx:responseError', function () {
    document.getElementById('flash').innerHTML = '<div class="alert alert-error">The request could not be completed.</div>';
  });
`,
        }}
      />
    </body>
  </html>
))
