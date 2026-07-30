<script lang="ts">
	import type { BookRef } from '../types.ts';

	let { books, headingLevel = 'h2' }: { books: BookRef[]; headingLevel?: 'h2' | 'h3' } = $props();
</script>

{#if books.length > 0}
	<section class="book-links">
		<svelte:element this={headingLevel}>関連書籍</svelte:element>
		<p class="disclosure">Amazonアソシエイト・楽天アフィリエイトのリンクを含みます（広告）</p>
		<ul>
			{#each books as b (b.url)}
				<li>
					<a href={b.url} target="_blank" rel="noopener noreferrer sponsored">
						<span class="title">{b.title}</span>
						{#if b.author}<span class="author">{b.author}</span>{/if}
					</a>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.book-links {
		margin: 0 0 20px;
		padding-top: 16px;
		border-top: 1px solid var(--line);
	}
	.book-links :global(h2),
	.book-links :global(h3) {
		margin: 0 0 6px;
		font-size: 0.78rem;
		color: var(--ink-muted);
		font-weight: 600;
	}
	.disclosure {
		margin: 0 0 10px;
		font-size: 0.7rem;
		color: var(--ink-muted);
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	a {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 6px 8px;
		margin: 0 -8px;
		border-radius: 8px;
		text-decoration: none;
		color: inherit;
	}
	a:hover {
		background: color-mix(in srgb, var(--ink) 6%, transparent);
	}
	.title {
		font-size: 0.85rem;
		line-height: 1.5;
	}
	.author {
		font-size: 0.72rem;
		color: var(--ink-muted);
	}
</style>
