<script lang="ts">
	let { level, onzoom }: { level: string; onzoom: (factor: number) => void } = $props();
</script>

<div class="zoomctl">
	<button type="button" onclick={() => onzoom(2)} aria-label="ズームイン">＋</button>
	<span class="level" aria-live="polite">{level}</span>
	<button type="button" onclick={() => onzoom(0.5)} aria-label="ズームアウト">−</button>
</div>

<style>
	.zoomctl {
		position: fixed;
		right: 16px;
		bottom: 20px;
		z-index: 5;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 8px;
		background: color-mix(in srgb, var(--bg-elevated) 92%, transparent);
		backdrop-filter: blur(6px);
		border: 1px solid var(--line);
		border-radius: 12px;
		box-shadow: var(--shadow);
	}
	button {
		width: 38px;
		height: 38px;
		border: 1px solid var(--line);
		border-radius: 9px;
		background: var(--bg-elevated);
		color: var(--ink);
		font-size: 1.1rem;
		cursor: pointer;
	}
	button:hover {
		border-color: var(--line-strong);
	}
	.level {
		font-size: 0.68rem;
		color: var(--ink-muted);
		writing-mode: vertical-rl;
		letter-spacing: 0.15em;
		padding: 2px 0;
	}
</style>
