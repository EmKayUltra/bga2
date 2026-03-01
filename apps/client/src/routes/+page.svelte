<script lang="ts">
	// BGA2 landing page — light + clean aesthetic
	const title = 'Board Game Arena 2';
	const subtitle = 'The next generation board game platform';
</script>

<main>
	<div class="hero">
		<h1>{title}</h1>
		<p class="subtitle">{subtitle}</p>
		<p class="status">Engine foundation — Phase 1</p>
	</div>
</main>

<style>
	:global(*, *::before, *::after) {
		box-sizing: border-box;
	}

	:global(body) {
		margin: 0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif;
		background: #f8fafc;
		color: #1e293b;
	}

	main {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
	}

	.hero {
		text-align: center;
		max-width: 600px;
	}

	h1 {
		font-size: clamp(2rem, 5vw, 3.5rem);
		font-weight: 700;
		margin: 0 0 1rem;
		color: #0f172a;
		letter-spacing: -0.02em;
	}

	.subtitle {
		font-size: 1.25rem;
		color: #475569;
		margin: 0 0 2rem;
		line-height: 1.6;
	}

	.status {
		display: inline-block;
		padding: 0.375rem 0.875rem;
		background: #e0f2fe;
		color: #0369a1;
		border-radius: 9999px;
		font-size: 0.875rem;
		font-weight: 500;
	}
</style>
