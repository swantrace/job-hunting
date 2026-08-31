import type { IconName } from '../ui/Icon'
import { Icon } from '../ui/Icon'

const links = [
  { href: '/', icon: 'dashboard', label: 'Dashboard', section: 'Workspace' },
  { href: '/applications', icon: 'briefcase', label: 'Applications', section: 'Workspace' },
  {
    href: '/applications/import',
    icon: 'archive',
    label: 'Import jobs',
    section: 'Workspace',
  },
  {
    href: '/career-documents',
    icon: 'document',
    label: 'Career documents',
    section: 'Career',
  },
  { href: '/skills', icon: 'tag', label: 'Skills', section: 'Career' },
  { href: '/companies', icon: 'building', label: 'Companies', section: 'Network' },
  { href: '/contacts', icon: 'users', label: 'Contacts', section: 'Network' },
  { href: '/import', icon: 'archive', label: 'Backup & restore', section: 'Tools' },
] satisfies { href: string; icon: IconName; label: string; section: string }[]

const sections = ['Workspace', 'Career', 'Network', 'Tools'] as const

export function AppNavigation({ currentPath = '/' }: { currentPath?: string }) {
  return (
    <nav class="flex h-full flex-col" aria-label="Primary navigation">
      <div class="mb-6 flex items-center justify-between gap-2">
        <a href="/" class="flex items-center gap-3 px-2 py-2 text-lg font-bold">
          <span class="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-content">
            JT
          </span>
          <span>Job Tracker</span>
        </a>
        <label
          for="app-nav-toggle"
          class="btn btn-ghost btn-square btn-sm lg:hidden"
          aria-label="Close navigation"
        >
          <Icon name="close" />
        </label>
      </div>
      {sections.map((section) => (
        <div class="mb-5">
          <p class="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-base-content/50">
            {section}
          </p>
          <ul class="menu w-full gap-1 p-0">
            {links
              .filter((link) => link.section === section)
              .map((link) => {
                const active =
                  link.href === currentPath ||
                  (link.href !== '/' && currentPath.startsWith(link.href))
                return (
                  <li>
                    <a href={link.href} class={active ? 'menu-active font-semibold' : undefined}>
                      <Icon name={link.icon} className="size-4" />
                      {link.label}
                    </a>
                  </li>
                )
              })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
