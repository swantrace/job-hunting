const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/career-documents', label: 'Career documents' },
  { href: '/manage', label: 'Manage data' },
  { href: '/import', label: 'Import JSON' },
  { href: '/export', label: 'Export JSON' },
]

export function AppNavigation() {
  return (
    <nav class="space-y-4">
      <a href="/" class="flex items-center gap-2 px-2 py-3 text-lg font-bold">
        <span class="badge badge-primary">JT</span> Job Tracker
      </a>
      <ul class="menu w-full rounded-box bg-base-100">
        {links.map((link) => (
          <li>
            <a href={link.href}>{link.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
