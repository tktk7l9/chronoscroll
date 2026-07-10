<script lang="ts">
	// chronoscrollのロゴマーク: 砂時計の中を年表のドット（カテゴリ色）が落ちていく。
	// 線はcurrentColor、ドットはテーマのカテゴリ色変数を参照するのでdark/lightに自動追従する。
	let { size = 22 }: { size?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 96 96"
	fill="none"
	stroke="currentColor"
	stroke-width="6"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	class="brand-mark"
>
	<path d="M26 10h44M26 86h44" />
	<path d="M32 12v10c0 14 13 18 13 26s-13 12-13 26v10" />
	<path d="M64 12v10c0 14-13 18-13 26s13 12 13 26v10" />
	<circle cx="48" cy="30" r="5.5" class="dot-a" stroke="none" />
	<circle cx="48" cy="48" r="4" class="dot-b" stroke="none" />
	<circle cx="48" cy="63" r="4.5" class="dot-c" stroke="none" />
	<path d="M39 78c2-3.5 5-5 9-5s7 1.5 9 5" stroke-width="5" opacity="0.65" />
</svg>

<style>
	.brand-mark {
		display: inline-block;
		vertical-align: -0.18em;
	}
	.dot-a {
		fill: var(--accent);
	}
	.dot-b {
		fill: var(--cat-politics);
	}
	.dot-c {
		fill: var(--cat-economy);
	}
</style>
