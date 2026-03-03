<script>
  // Dev-only layout — no authentication required
  // Used for test harness and other dev tools
</script>

<div class="dev-layout">
  <div class="dev-banner">
    <span class="dev-badge">DEV</span>
    <a href="/dev/harness">Test Harness</a>
  </div>
  <slot />
</div>

<style>
  .dev-layout {
    min-height: 100vh;
    background: #0a0a1a;
    color: #e0e0e0;
  }
  .dev-banner {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 1rem;
    background: #1a1a2e;
    border-bottom: 2px solid #e74c3c;
    font-family: monospace;
  }
  .dev-badge {
    background: #e74c3c;
    color: white;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: bold;
    font-size: 0.75rem;
  }
  .dev-banner a {
    color: #4a90d9;
    text-decoration: none;
  }
  .dev-banner a:hover {
    text-decoration: underline;
  }
</style>
