const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/applications', label: 'Applications' },
  { href: '/career-documents', label: 'Career documents' },
  { href: '/manage', label: 'Manage data' },
]

export function AppNavigation({ currentPath = '/' }: { currentPath?: string }) {
  return (
    <nav class="space-y-4">
      <a href="/" class="flex items-center gap-2 px-2 py-3 text-lg font-bold">
        <span class="badge badge-primary">JT</span> Job Tracker
      </a>
      <ul class="menu w-full gap-1 rounded-box">
        {links.map((link) => {
          const active =
            link.href === currentPath || (link.href !== '/' && currentPath.startsWith(link.href))
          return (
            <li>
              <a
                href={link.href}
                class={`rounded-lg ${
                  active ? 'bg-primary font-semibold text-primary-content' : 'hover:bg-base-300'
                }`}
              >
                {link.label}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
