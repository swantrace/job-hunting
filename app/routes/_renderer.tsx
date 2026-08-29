import { jsxRenderer } from 'hono/jsx-renderer'
import { Link } from 'honox/server'

export default jsxRenderer(({ children }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="description" content="Local-first job application tracker" />
      <title>Job Application Tracker</title>
      <Link href="/app/style.css" rel="stylesheet" />
      <script src="https://cdn.jsdelivr.net/npm/htmx.org@2.0.8/dist/htmx.min.js"></script>
      <script
        dangerouslySetInnerHTML={{
          __html: `htmx.config.allowNestedOobSwaps = false;
htmx.config.responseHandling = [
  { code: '204', swap: false },
  { code: '422', swap: true },
  { code: '[23]..', swap: true },
  { code: '[45]..', swap: false, error: true },
  { code: '...' },
];`,
        }}
      />
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
  function dismissFlash() {
    const flash = document.querySelector('#flash [data-flash-autodismiss]');
    if (!flash || flash.dataset.dismissScheduled) return;
    flash.dataset.dismissScheduled = 'true';
    window.setTimeout(function () {
      flash.classList.add('opacity-0', 'transition-opacity', 'duration-300');
      window.setTimeout(function () { flash.remove(); }, 300);
    }, 4000);
  }
  window.updateSkillRequirements = function () {
    const root = document.getElementById('skill-requirements');
    if (!root) return;
    const rows = root.querySelectorAll('[data-skill-row]');
    const requirements = [];
    rows.forEach(function (row) {
      requirements.push({
        rawLabel: row.querySelector('[data-skill-raw]').value,
        canonicalLabel: row.querySelector('[data-skill-canonical]').value,
        category: row.querySelector('[data-skill-category]').value,
        importance: row.querySelector('[data-skill-importance]').value,
        sourceText: row.querySelector('[data-skill-source]').value,
        confidence: Number(row.querySelector('[data-skill-confidence]').value) || 0,
      });
    });
    const target = root.querySelector('textarea[name="skillRequirements"]');
    if (target) target.value = JSON.stringify(requirements);
  };
  window.updateJobAnalysis = function () {
    const root = document.getElementById('job-analysis-draft');
    if (!root) return;
    const value = function (selector) {
      const element = root.querySelector(selector);
      return element ? element.value : '';
    };
    const number = function (selector) {
      const parsed = Number(value(selector));
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const summary = {
      rolePurpose: value('[data-ja-role-purpose]'),
      idealCandidate: value('[data-ja-ideal-candidate]'),
    };
    const classification = {
      roleType: value('[data-ja-role-type]'),
      advertisedSeniority: value('[data-ja-advertised]'),
      practicalSeniority: value('[data-ja-practical]'),
      rationale: value('[data-ja-rationale]'),
      functionalEmphasis: {
        frontend: number('[data-ja-fe="frontend"]'),
        backend: number('[data-ja-fe="backend"]'),
        testingQuality: number('[data-ja-fe="testingQuality"]'),
        devopsInfrastructure: number('[data-ja-fe="devopsInfrastructure"]'),
        collaborationOwnership: number('[data-ja-fe="collaborationOwnership"]'),
      },
    };
    const requirements = [];
    root.querySelectorAll('[data-ja-requirement]').forEach(function (row) {
      requirements.push({
        type: row.querySelector('[data-ja-type]').value,
        importance: row.querySelector('[data-ja-importance]').value,
        basis: row.querySelector('[data-ja-basis]').value,
        statement: row.querySelector('[data-ja-statement]').value,
        sourceText: row.querySelector('[data-ja-source]').value,
        inferenceRationale: row.querySelector('[data-ja-inference]')
          ? row.querySelector('[data-ja-inference]').value.trim() || null
          : null,
      });
    });
    const interviewQuestions = [];
    root.querySelectorAll('[data-ja-interview]').forEach(function (element) {
      const text = element.value.trim();
      if (text) interviewQuestions.push(text);
    });
    const target = root.querySelector('textarea[name="jobAnalysis"]');
    if (target) target.value = JSON.stringify({ summary, classification, requirements, interviewQuestions });
    const totalElement = root.querySelector('[data-ja-fe-total]');
    if (totalElement) {
      const total = Object.values(classification.functionalEmphasis).reduce(function (sum, part) { return sum + part; }, 0);
      totalElement.textContent = 'Total: ' + total + (total === 100 ? '' : ' (must be 100)');
    }
  };
  document.addEventListener('DOMContentLoaded', initBouncer);
  document.addEventListener('DOMContentLoaded', dismissFlash);
  document.body.addEventListener('htmx:afterSwap', function (event) {
    initBouncer(event);
    dismissFlash();
  });
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
    const openQuickCollect = target && target.closest('[data-open-quick-collect]');
    const closeQuickCollect = target && target.closest('[data-close-quick-collect]');
    if (openQuickCollect || closeQuickCollect) {
      const quickCollectToggle = document.getElementById('quick-collect-toggle');
      if (quickCollectToggle) quickCollectToggle.checked = Boolean(openQuickCollect);
      return;
    }
    const openWorkspace = target && target.closest('[data-open-workspace]');
    if (openWorkspace) {
      const drawerToggle = document.getElementById('workspace-toggle');
      if (drawerToggle) drawerToggle.checked = true;
      return;
    }
    const openDrawer = target && target.closest('[data-open-drawer]');
    if (openDrawer) {
      const drawerToggle = document.getElementById(openDrawer.dataset.openDrawer);
      if (drawerToggle) drawerToggle.checked = true;
      return;
    }
    const tabButton = target && target.closest('[data-workspace-tab]');
    if (!tabButton) return;
    const shell = document.getElementById('workspace-shell') || document;
    const tab = tabButton.dataset.workspaceTab;
    shell.querySelectorAll('[data-workspace-panel]').forEach(function (panel) {
      panel.classList.toggle('hidden', panel.id !== 'workspace-' + tab + '-panel');
    });
    shell.querySelectorAll('[data-workspace-tab]').forEach(function (button) {
      const active = button === tabButton;
      button.classList.toggle('tab-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.tabIndex = active ? 0 : -1;
    });
  });
  document.body.addEventListener('click', function (event) {
    const target = event.target instanceof Element ? event.target : null;
    const openAiModal = target && target.closest('[data-open-ai-modal]');
    if (openAiModal) {
      const dialog = document.getElementById('ai_parser_modal');
      if (dialog && typeof dialog.showModal === 'function') dialog.showModal();
    }
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
