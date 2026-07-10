<script lang="ts">
	let { id, size = 64 }: { id: string; size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true" class="art-icon">
	<use href="/art/sprite.svg#{id}" />
</svg>

<style>
	.art-icon {
		display: block;
		color: var(--ink);
	}
</style>
