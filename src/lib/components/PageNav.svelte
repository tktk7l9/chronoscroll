<script lang="ts">
	// Header links on the static pages (/c, /c/[slug], /e/[id]). These pages have no
	// timeline chrome, so without this the only way back was the logo (SHIG 59, 60, 82).
	// Labels are nouns (SHIG 33).
	let { current = null }: { current?: 'collections' | null } = $props();
</script>

<nav class="page-nav" aria-label="サイト内">
	<!-- The timeline (/) is a CSR route; these pages are csr=false, so reload into it -->
	<a href="/" data-sveltekit-reload>年表</a>
	<a href="/c" aria-current={current === 'collections' ? 'page' : undefined}>特集</a>
</nav>

<style>
	.page-nav {
		display: flex;
		align-items: center;
		gap: 4px;
		flex: none;
	}
	a {
		display: inline-flex;
		align-items: center;
		/* 7mm touch target (SHIG 78) */
		min-height: 32px;
		padding: 0 8px;
		font-size: 0.8rem;
		color: var(--ink-muted);
		text-decoration: none;
		border-radius: 999px;
	}
	a:hover {
		color: var(--accent);
	}
	a[aria-current='page'] {
		color: var(--ink);
		font-weight: 700;
	}
</style>
