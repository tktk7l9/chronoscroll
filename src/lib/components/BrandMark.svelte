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

	/* ブランド（リンク）ホバーで砂時計の砂が落ちる遊び */
	:global(.brand:hover) .dot-a {
		animation: sand-fall 0.7s ease-in;
	}
	:global(.brand:hover) .dot-b {
		animation: sand-fall 0.7s ease-in 0.12s;
	}
	:global(.brand:hover) .dot-c {
		animation: sand-fall 0.7s ease-in 0.24s;
	}
	@keyframes sand-fall {
		0% {
			transform: translateY(0);
			opacity: 1;
		}
		55% {
			transform: translateY(14px);
			opacity: 0;
		}
		56% {
			transform: translateY(-10px);
			opacity: 0;
		}
		100% {
			transform: translateY(0);
			opacity: 1;
		}
	}
</style>
