import { describe, expect, test } from 'bun:test'
import { SkillRequirementsEditor } from '../../app/components/SkillRequirementsEditor'
import { renderJsx } from './support/html-contract'

const requirements = [
  {
    rawLabel: 'Apache Kafka',
    canonicalLabel: 'Kafka',
    category: 'messaging-async' as const,
    importance: 'required' as const,
    sourceText: 'Experience building event-driven systems with Kafka',
    confidence: 0.96,
  },
]

describe('structured skill requirement draft', () => {
  test('owns a stable skill-requirements region with an authoritative JSON field', async () => {
    const html = await renderJsx(<SkillRequirementsEditor requirements={requirements} />)

    expect(html).toContain('id="skill-requirements"')
    expect(html).toContain('name="skillRequirements"')
    expect(html).toContain('data-skill-row')
    expect(html).toContain('data-skill-canonical')
    expect(html).toContain('data-skill-category')
    expect(html).toContain('data-skill-importance')
  })

  test('preserves raw label, source excerpt, and confidence as hidden fields', async () => {
    const html = await renderJsx(<SkillRequirementsEditor requirements={requirements} />)

    expect(html).toContain('data-skill-raw')
    expect(html).toContain('Apache Kafka')
    expect(html).toContain('Experience building event-driven systems with Kafka')
    expect(html).toContain('data-skill-confidence')
  })
})
