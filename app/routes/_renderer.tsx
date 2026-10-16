import { jsxRenderer } from 'hono/jsx-renderer'
import { Link } from 'honox/server'
import type { Manifest } from 'vite'

// Shared browser behavior is required even on pages without HonoX islands.
const manifests = import.meta.glob<Manifest>('/dist/.vite/manifest.json', {
  eager: true,
  import: 'default',
})
const clientEntry = Object.values(manifests)[0]?.['app/client.ts']
const clientSrc = import.meta.env.PROD
  ? `${import.meta.env.BASE_URL}${clientEntry!.file}`
  : '/app/client.ts'

export default jsxRenderer(({ children }) => (
  <html lang="en">
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
      <script type="module" src={clientSrc}></script>
    </body>
  </html>
))
