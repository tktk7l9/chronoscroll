<script lang="ts">
	import { browser } from '$app/environment';

	type Mode = 'auto' | 'light' | 'dark';

	function initialMode(): Mode {
		if (!browser) return 'auto';
		const saved = localStorage.getItem('theme');
		return saved === 'light' || saved === 'dark' ? saved : 'auto';
	}

	let mode = $state<Mode>(initialMode());

	$effect(() => {
		if (!browser) return;
		if (mode === 'auto') {
			delete document.documentElement.dataset.theme;
			localStorage.removeItem('theme');
		} else {
			document.documentElement.dataset.theme = mode;
			localStorage.setItem('theme', mode);
		}
	});

	const next: Record<Mode, Mode> = { auto: 'dark', dark: 'light', light: 'auto' };
	const icons: Record<Mode, string> = { auto: '◐', dark: '☾', light: '☀' };
	const labels: Record<Mode, string> = { auto: '自動', dark: 'ダーク', light: 'ライト' };
</script>

<button
	type="button"
	class="theme-toggle"
	onclick={() => (mode = next[mode])}
	aria-label="テーマ切替（現在: {labels[mode]}）"
	title="テーマ: {labels[mode]}"
>
	<span aria-hidden="true">{icons[mode]}</span>
</button>

<style>
	.theme-toggle {
		width: 34px;
		height: 34px;
		border: 1px solid var(--line);
		border-radius: 50%;
		background: var(--bg-elevated);
		color: var(--ink);
		font-size: 0.95rem;
		cursor: pointer;
		line-height: 1;
	}
	.theme-toggle:hover {
		border-color: var(--line-strong);
	}
</style>
