<script lang="ts">
	import { CURRENT_SPONSOR, validateSponsor } from '../sponsor.ts';

	const sponsor =
		CURRENT_SPONSOR && validateSponsor(CURRENT_SPONSOR).length === 0 ? CURRENT_SPONSOR : null;
</script>

{#if sponsor}
	<aside class="sponsor-slot" aria-label="広告">
		<span class="badge">広告</span>
		<a href={sponsor.href} target="_blank" rel="noopener noreferrer sponsored">
			<img
				src={sponsor.imageSrc}
				width={sponsor.imageWidth}
				height={sponsor.imageHeight}
				alt={sponsor.alt}
				loading="lazy"
			/>
		</a>
	</aside>
{/if}

<style>
	.sponsor-slot {
		margin: 0 0 20px;
		padding-top: 16px;
		border-top: 1px solid var(--line);
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
	}
	.badge {
		font-size: 0.68rem;
		color: var(--ink-muted);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 1px 8px;
	}
	img {
		display: block;
		max-width: 100%;
		height: auto;
		border-radius: 8px;
	}
</style>
