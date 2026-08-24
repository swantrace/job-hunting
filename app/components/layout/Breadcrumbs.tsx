export function Breadcrumbs({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav class="breadcrumbs text-sm" aria-label="Breadcrumbs">
      <ul>
        {items.map((item) => (
          <li>
            {item.href ? (
              <a class="link" href={item.href}>
                {item.label}
              </a>
            ) : (
              item.label
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}
