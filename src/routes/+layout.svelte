<script lang="ts">
	import { browser } from '$app/environment';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();

	if (browser && import.meta.env.PROD) {
		void import('@vercel/analytics').then(({ inject }) => inject());
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
